import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tixing.offline.ai',
  appName: '题小星',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f0e7',
  },
}

export default config
