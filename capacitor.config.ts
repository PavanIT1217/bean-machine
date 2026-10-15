import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.pavanit1217.beanmachine',
  appName: 'Galton',
  webDir: 'dist',
  backgroundColor: '#fbf8f1',
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#fbf8f1',
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
