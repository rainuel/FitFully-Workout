package com.fitfully.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Ignore the phone's font-size setting inside the WebView so text is the same size on every device.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
