export default function Loading() {
  return <main className="voltix-native-overlay" aria-live="polite">
    <div className="voltix-native-loader">
      <img src="/apk-icon.png" alt="" className="voltix-native-v" draggable={false} />
    </div>
  </main>;
}
