import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pencales.app',
  appName: 'PencaLes',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0B0F1A',
      showSpinner: false,
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '917674823527-hh4as8jg5mi9gdltjnqgjh4a7fuc07ri.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
