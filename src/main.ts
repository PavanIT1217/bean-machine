import './style.css';
import { App } from './app';
import { registerServiceWorker } from './pwa/register';

const params = new URLSearchParams(location.search);
new App().start(params.get('autoplay') === '1');
registerServiceWorker();
