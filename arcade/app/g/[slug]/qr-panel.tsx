import QRCode from "qrcode";

export async function QrPanel({ url }: { url: string }) {
  const dataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: 220,
    color: { dark: "#ececf1", light: "#00000000" },
  });
  return (
    <div className="qrPanel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR code for ${url}`} width={110} height={110} />
      <p>Scan to play on your phone</p>
    </div>
  );
}
