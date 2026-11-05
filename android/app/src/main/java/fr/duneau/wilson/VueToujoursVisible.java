package fr.duneau.wilson;

import android.content.Context;
import android.view.View;
import android.webkit.WebView;

/**
 * La vue web de Wilson ne se croit jamais cachée (PLAN 9, A2) : quand Google Maps passe devant, la page continue
 * d'écouter, de parler et de compter le temps, au lieu de se mettre en pause comme un onglet de Chrome.
 */
public class VueToujoursVisible extends WebView {
    public VueToujoursVisible(Context context) { super(context); }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(View.VISIBLE);
    }
}
