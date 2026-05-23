import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ma.dabacash.app",
  appName: "DabaCash",
  webDir: "out", // Next.js static export output
  bundledWebRuntime: false,

  server: {
    // During local development: point to Next.js dev server
    // In production builds this is commented out (uses bundled assets)
    // url: "http://10.0.2.2:3000",
    // cleartext: true,
    androidScheme: "https",
  },

  android: {
    buildOptions: {
      keystorePath: "dabacash.keystore",
      keystoreAlias: "dabacash-key",
    },
    minSdkVersion: 24,   // Android 7.0+
    targetSdkVersion: 34,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0f172a",   // dark-950
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f172a",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
