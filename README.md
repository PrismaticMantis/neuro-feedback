# Neuro-Somatic Feedback App

A web-based neurofeedback application that connects to Muse EEG devices and trains nervous system self-regulation through real-time neurosomatic feedback.

![Screenshot](screenshot.png)

## Features

### 🧠 Quiet Power Detection
Detects a calm, focused brain state ("Quiet Power") defined by:
- Beta power lower than Alpha power
- Low EEG signal variance (smooth signals)
- Motion and noise below threshold
- All conditions sustained for 5+ seconds

### 🎵 Audio System
- **Entrainment Audio** (optional): Binaural beats or isochronic tones to guide the nervous system
- **Reward Signals**: Vibroacoustic sub-bass + subtle synth tone when Quiet Power is achieved

### 📊 HeartMath-Style Coherence Graph
- Real-time scrolling visualization
- Three distinct zones: Quiet Power / Stabilizing / Low Coherence
- Glowing indicator shows current position

### 👤 Multi-User Support
- User profiles stored in browser (localStorage)
- Import/export user data as JSON
- Session history per user

### 📄 Session Reports
- Session summary with stats
- Export as PDF report
- Track progress over time

## Getting Started

### Prerequisites
- Node.js 18+
- Chrome, Edge, or Opera browser (for Web Bluetooth)
- Muse 2 or Muse S headband

### Installation

```bash
cd neuro-feedback
npm install
npm run dev
```

### Connecting Your Muse

1. **Direct Bluetooth** (recommended):
   - Turn on your Muse headband (LED should blink)
   - Click "Connect Bluetooth" in the app
   - Select your Muse from the browser dialog

2. **Via Mind Monitor** (alternative):
   - Install Mind Monitor app on your phone
   - Connect Muse to Mind Monitor
   - Set up OSC streaming to your computer
   - Click "Connect via OSC" in the app

## Usage

1. **Create a User Profile** - Enter your name to track sessions
2. **Connect Your Muse** - Via Bluetooth or OSC
3. **Configure Audio** (optional) - Enable binaural beats or isochronic tones
4. **Begin Practice** - Watch the coherence graph and aim for the Quiet Power zone
5. **End Session** - View your stats and export a PDF report

## Tech Stack

- **React 18** + TypeScript
- **Vite** for build tooling
- **muse-js** for Bluetooth EEG connection
- **osc-js** for OSC protocol support
- **Framer Motion** for animations
- **jsPDF** for PDF export
- **Web Audio API** for entrainment and reward sounds

## Project Structure

```
src/
├── lib/
│   ├── muse-handler.ts    # Muse EEG connection & FFT processing
│   ├── audio-engine.ts    # Entrainment & reward audio
│   ├── quiet-power.ts     # Target state detection
│   └── storage.ts         # User/session persistence
├── hooks/
│   ├── useMuse.ts         # React hook for Muse data
│   ├── useAudio.ts        # Audio controls hook
│   └── useSession.ts      # Session state management
├── components/
│   ├── SessionSetup.tsx   # Setup screen
│   ├── ActiveSession.tsx  # Active session screen
│   ├── SessionSummary.tsx # Summary screen
│   ├── CoherenceGraph.tsx # HeartMath-style graph
│   └── ConnectionStatus.tsx
├── App.tsx
└── types.ts
```

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Web Bluetooth | ✅ | ✅ | ❌ | ❌ |
| Web Audio | ✅ | ✅ | ✅ | ✅ |
| OSC (fallback) | ✅ | ✅ | ✅ | ✅ |

## License

MIT
