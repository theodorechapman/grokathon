export function HeroArt() {
  return (
    <div className="cosmos" aria-hidden="true">
      <video
        className="cosmosMedia cosmosVideo"
        src="/hero-gameboy.mp4"
        poster="/hero-gameboy.jpg"
        autoPlay
        muted
        loop
        playsInline
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hero-gameboy.jpg" alt="" className="cosmosMedia cosmosStill" />
      <div className="cosmosShade" />
    </div>
  );
}
