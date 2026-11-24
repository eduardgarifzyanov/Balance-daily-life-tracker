package io.github.eduardgarifzyanov.balance;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int OPEN_BACKUP = 1;
    private static final int SAVE_BACKUP = 2;
    private static final int NOTIFICATION_PERMISSION = 3;
    private static final Map<String, String> FILES = new HashMap<>();
    static {
        FILES.put("/", "text/html");
        FILES.put("/app.js", "text/javascript");
        FILES.put("/offline.js", "text/javascript");
        FILES.put("/style.css", "text/css");
        FILES.put("/icon.svg", "image/svg+xml");
    }
    private static final String CSP = "default-src 'none'; script-src 'self'; "
        + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-src 'none'";

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] exportData;
    private String reminderDestination;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        reminderDestination = getIntent().getStringExtra(ReminderScheduler.OPEN_SECTION);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(246, 247, 239));
        webView = new WebView(this);
        frame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);

        if (Build.VERSION.SDK_INT >= 35) {
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets system = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                );
                view.setPadding(system.left, system.top, system.right, system.bottom);
                return insets;
            });
            frame.requestApplyInsets();
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new BackupBridge(), "BalanceAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isHome(request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (!isLocal(uri) || !"GET".equals(request.getMethod()) || !FILES.containsKey(path)) {
                    return notFound();
                }
                try {
                    String file = "/".equals(path) ? "index.html" : path.substring(1);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Content-Security-Policy", CSP);
                    headers.put("X-Content-Type-Options", "nosniff");
                    return new WebResourceResponse(FILES.get(path), "UTF-8", 200, "OK",
                        headers,
                        getAssets().open(file));
                } catch (IOException error) {
                    return notFound();
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .setType("*/*")
                    .addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(intent, OPEN_BACKUP);
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    notifyUser("На телефоне нет приложения для выбора файла");
                }
                return true;
            }
        });
        webView.loadUrl("https://" + HOST + "/");
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }

    private static boolean isHome(Uri uri) {
        return isLocal(uri) && "/".equals(uri.getPath());
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0]));
    }

    @Override
    protected void onResume() {
        super.onResume();
        ReminderScheduler.refresh(this, false);
        refreshReminderControls();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        synchronized (this) {
            reminderDestination = intent.getStringExtra(ReminderScheduler.OPEN_SECTION);
        }
        if (webView != null) {
            webView.evaluateJavascript("window.balanceOpenNotification && window.balanceOpenNotification()", null);
        }
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == NOTIFICATION_PERMISSION) {
            ReminderScheduler.refresh(this, false);
            refreshReminderControls();
        }
    }

    private void refreshReminderControls() {
        if (webView != null) {
            webView.evaluateJavascript("window.balanceReminderStatusChanged && window.balanceReminderStatusChanged()", null);
        }
    }

    private void openSettings(Intent intent) {
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            notifyUser("Открой настройки «Баланс» в Android");
        }
    }

    public final class BackupBridge {
        @JavascriptInterface
        public String getReminders(String legacy) {
            return ReminderScheduler.list(MainActivity.this, legacy);
        }

        @JavascriptInterface
        public boolean changeReminder(String action, String argument) {
            return ReminderScheduler.change(MainActivity.this, action, argument);
        }

        @JavascriptInterface
        public boolean reminderNotificationsAllowed() {
            return ReminderScheduler.canNotify(MainActivity.this);
        }

        @JavascriptInterface
        public boolean exactRemindersAllowed() {
            return ReminderScheduler.canBeExact(MainActivity.this);
        }

        @JavascriptInterface
        public void openReminderSettings() {
            runOnUiThread(() -> {
                boolean requested = getPreferences(MODE_PRIVATE).getBoolean("notificationRequested", false);
                if (Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                    && (!requested || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
                    getPreferences(MODE_PRIVATE).edit().putBoolean("notificationRequested", true).apply();
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
                    return;
                }
                boolean appNotifications = ReminderScheduler.notifications(MainActivity.this).areNotificationsEnabled();
                Intent intent = new Intent(appNotifications
                    ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS : Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                if (appNotifications) intent.putExtra(Settings.EXTRA_CHANNEL_ID, ReminderScheduler.CHANNEL);
                openSettings(intent);
            });
        }

        @JavascriptInterface
        public void openExactReminderSettings() {
            if (Build.VERSION.SDK_INT >= 31) {
                runOnUiThread(() -> openSettings(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .setData(Uri.parse("package:" + getPackageName()))));
            }
        }

        @JavascriptInterface
        public boolean testReminder() {
            return ReminderScheduler.test(MainActivity.this);
        }

        @JavascriptInterface
        public String takeReminderDestination() {
            synchronized (MainActivity.this) {
                String destination = reminderDestination;
                reminderDestination = null;
                return destination;
            }
        }

        @JavascriptInterface
        public void saveBackup(String json) {
            byte[] data = json.getBytes(StandardCharsets.UTF_8);
            runOnUiThread(() -> {
                if (exportData != null || isFinishing()) return;
                exportData = data;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .putExtra(Intent.EXTRA_TITLE, "balance-diary.json");
                try {
                    startActivityForResult(intent, SAVE_BACKUP);
                } catch (ActivityNotFoundException error) {
                    exportData = null;
                    notifyUser("На телефоне нет приложения для сохранения файла");
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent intent) {
        super.onActivityResult(code, result, intent);
        Uri uri = result == RESULT_OK && intent != null ? intent.getData() : null;
        boolean isDocument = uri != null && "content".equals(uri.getScheme());
        if (code == OPEN_BACKUP && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(isDocument ? new Uri[]{uri} : null);
        } else if (code == SAVE_BACKUP && exportData != null) {
            byte[] data = exportData;
            exportData = null;
            if (isDocument) {
                new Thread(() -> writeFile(uri, data), "balance-export").start();
            }
        }
    }

    private void writeFile(Uri uri, byte[] data) {
        try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IOException("Cannot open document");
            output.write(data);
        } catch (IOException | SecurityException error) {
            runOnUiThread(() -> notifyUser("Не удалось сохранить копию"));
            return;
        }
        runOnUiThread(() -> notifyUser("Копия сохранена"));
    }

    private void notifyUser(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
            "Boolean(window.balanceBack && window.balanceBack())",
            handled -> {
                if (!"true".equals(handled)) finish();
            }
        );
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (webView != null) {
            webView.removeJavascriptInterface("BalanceAndroid");
            ((FrameLayout) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

