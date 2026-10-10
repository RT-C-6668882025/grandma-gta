package com.rt.grandmagta;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.*;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;

public class MainActivity extends Activity {
  private WebView web;
  private FrameLayout root;
  private View custom;
  private WebChromeClient.CustomViewCallback callback;
  private void immersive() {
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      WindowInsetsController c=getWindow().getInsetsController();
      if(c!=null) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
    } else getWindow().getDecorView().setSystemUiVisibility(5894);
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    root=new FrameLayout(this); web=new WebView(this); root.addView(web); setContentView(root); immersive();
    WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);s.setAllowFileAccess(false);s.setAllowContentAccess(false);
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest request) {
        return !"appassets.androidplatform.net".equals(request.getUrl().getHost());
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest request) {
        if(!"appassets.androidplatform.net".equals(request.getUrl().getHost())) return blocked();
        String path=request.getUrl().getPath();if(path==null||path.contains("..")) return blocked();
        if(path.equals("/")) path="/index.html";
        String type="application/octet-stream";
        if(path.endsWith(".html"))type="text/html";else if(path.endsWith(".js"))type="application/javascript";
        else if(path.endsWith(".css"))type="text/css";else if(path.endsWith(".json"))type="application/json";
        else if(path.endsWith(".mp3"))type="audio/mpeg";else if(path.endsWith(".png"))type="image/png";
        else if(path.endsWith(".jpg"))type="image/jpeg";else if(path.endsWith(".gz"))type="application/gzip";
        try { InputStream in=getAssets().open("web"+path); return new WebResourceResponse(type,"UTF-8",200,"OK",new HashMap<String,String>(),in); }
        catch(Exception e){return blocked();}
      }
      private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<String,String>(),new ByteArrayInputStream(new byte[0]));}
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public void onShowCustomView(View view,CustomViewCallback cb) { if(custom!=null){cb.onCustomViewHidden();return;}custom=view;callback=cb;root.addView(view);web.setVisibility(View.GONE);immersive(); }
      @Override public void onHideCustomView() {if(custom==null)return;root.removeView(custom);custom=null;web.setVisibility(View.VISIBLE);callback.onCustomViewHidden();callback=null;immersive();}
    });
    web.loadUrl("https://appassets.androidplatform.net/index.html");
  }
  @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)immersive();}
  @Override protected void onPause(){super.onPause();if(web!=null)web.onPause();}
  @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();immersive();}
  @Override public void onBackPressed(){if(custom!=null){web.getWebChromeClient().onHideCustomView();return;}web.evaluateJavascript("import('./src/input.js').then(m=>m.pressed.add('Escape'))",null);}
  @Override protected void onDestroy(){if(web!=null){root.removeView(web);web.destroy();}super.onDestroy();}
}
