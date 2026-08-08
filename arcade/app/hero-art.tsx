export function HeroArt() {
  return (
    <div className="cosmos" aria-hidden="true">
      <video
        className="cosmosMedia cosmosVideo"
        src="/hero-space.mp4"
        poster="/hero-space.jpg"
        autoPlay
        muted
        loop
        playsInline
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hero-space.jpg" alt="" className="cosmosMedia cosmosStill" />
      <div className="cosmosShade" />
    </div>
  );
}
