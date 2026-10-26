/** Punto de entrada: carga estilos, registra pantallas y paneles, y arranca la aplicación. */
import './ui/style.css';
import { App } from './app/app';
import './ui/screens';
import './ui/panels';
import './ui/modals';
import './ui/hubpanels';
import './ui/options';
import { installE2E } from './app/e2e';

const app = new App();
if (new URLSearchParams(location.search).has('e2e')) installE2E(app);
app.start();
