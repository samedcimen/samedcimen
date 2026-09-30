// WakaTime'dan son 7 günün (bugün dahil) kodlama süresini çekip profil kartlarıyla
// aynı tasarımda Türkçe SVG kart üretir: profile/wakatime-koyu.svg ve wakatime-acik.svg.
//
// Kullanım: WAKATIME_API_KEY=... node scripts/wakatime-kart.mjs
// Dil renkleri: scripts/dil-renkleri.json (github-stats-extended, MIT lisansı).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const anahtar = process.env.WAKATIME_API_KEY;
if (!anahtar) {
    console.error("WAKATIME_API_KEY tanımlı değil.");
    process.exit(1);
}

const GENISLIK = 810; // yukarıdaki iki kartın (400 + 400) toplam genişliği
const DIL_SAYISI = 5;
const renkler = JSON.parse(readFileSync(new URL("./dil-renkleri.json", import.meta.url), "utf8"));

const TEMALAR = {
    koyu: { bg: "#0d1117", baslik: "#8b5cf6", metin: "#c3d1d9", soluk: "#8b949e", ray: "#30363d" },
    acik: { bg: "#fffefe", baslik: "#7c3aed", metin: "#434d58", soluk: "#6e7781", ray: "#ddd" },
};

// ── Veri ──────────────────────────────────────────────────────────────────────

// Günlük özetler bugünü de içerir (haftalık "stats" uç noktası yalnızca bitmiş günleri sayar)
const yanit = await fetch("https://wakatime.com/api/v1/users/current/summaries?range=last_7_days", {
    headers: { Authorization: `Basic ${Buffer.from(anahtar).toString("base64")}` },
});
if (!yanit.ok) {
    console.error(`WakaTime API hatası: ${yanit.status} ${await yanit.text()}`);
    process.exit(1);
}
const { data: gunler } = await yanit.json();

const diller = new Map();
let toplamSaniye = 0;
for (const gun of gunler) {
    toplamSaniye += gun.grand_total?.total_seconds ?? 0;
    for (const dil of gun.languages ?? []) {
        diller.set(dil.name, (diller.get(dil.name) ?? 0) + dil.total_seconds);
    }
}

const enCok = [...diller.entries()]
    .filter(([, sn]) => sn >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, DIL_SAYISI)
    .map(([ad, sn]) => ({ ad, sn, yuzde: toplamSaniye ? (sn / toplamSaniye) * 100 : 0 }));

// ── Biçimlendirme ─────────────────────────────────────────────────────────────

function sure(saniye) {
    const sa = Math.floor(saniye / 3600);
    const dk = Math.floor((saniye % 3600) / 60);
    if (sa && dk) return `${sa} sa ${dk} dk`;
    if (sa) return `${sa} sa`;
    return `${dk} dk`;
}

const tarih = (s) => new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
const aralik = gunler.length ? `${tarih(gunler[0].range.date)} – ${tarih(gunler.at(-1).range.date)}` : "";

const kacis = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Koyu temada zeminle karışan çok koyu dil renkleri (ör. JSON #292929) yerine soluk metin rengi
function okunurRenk(hex, t) {
    if (!hex) return t.baslik;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const parlaklik = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (t === TEMALAR.koyu && parlaklik < 0.2) return t.soluk;
    if (t === TEMALAR.acik && parlaklik > 0.85) return t.soluk;
    return hex;
}

// ── SVG ───────────────────────────────────────────────────────────────────────

function kart(t) {
    const SATIR = 34;
    const BAS = 88; // başlık + özet satırı
    const bos = enCok.length === 0;
    const yukseklik = bos ? 120 : BAS + enCok.length * SATIR - 4;
    const RAY_X = 150;
    const RAY_G = GENISLIK - RAY_X - 175; // sağda süre · yüzde metni için yer

    const satirlar = enCok.map((d, i) => {
        const y = BAS + i * SATIR;
        const renk = okunurRenk(renkler[d.ad], t);
        const dolu = Math.max(4, (RAY_G * d.yuzde) / 100);
        return `
    <g class="satir" style="animation-delay:${150 + i * 120}ms">
      <text x="25" y="${y + 12}" class="dil">${kacis(d.ad)}</text>
      <rect x="${RAY_X}" y="${y + 3}" width="${RAY_G}" height="8" rx="4" fill="${t.ray}" />
      <rect x="${RAY_X}" y="${y + 3}" width="${dolu.toFixed(1)}" height="8" rx="4" fill="${renk}" class="dolgu" />
      <text x="${GENISLIK - 25}" y="${y + 12}" class="deger" text-anchor="end">${sure(d.sn)} · %${d.yuzde.toFixed(1).replace(".", ",")}</text>
    </g>`;
    }).join("");

    const icerik = bos
        ? `<text x="25" y="${BAS + 12}" class="dil">Bu hafta henüz ölçülmüş kodlama süresi yok.</text>`
        : satirlar;

    return `<svg width="${GENISLIK}" height="${yukseklik}" viewBox="0 0 ${GENISLIK} ${yukseklik}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="baslik">
  <title id="baslik">Bu hafta kod yazarken: ${sure(toplamSaniye)}</title>
  <style>
    .baslik { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.baslik}; }
    .ozet { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.metin}; }
    .aralik { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.soluk}; }
    .dil { font: 600 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.metin}; }
    .deger { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${t.soluk}; }
    .satir { opacity: 0; animation: belir 0.4s ease-out forwards; }
    .dolgu { transform-box: fill-box; transform-origin: left; animation: uza 0.8s ease-out forwards; }
    @keyframes belir { to { opacity: 1; } }
    @keyframes uza { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  </style>
  <rect x="0.5" y="0.5" width="${GENISLIK - 1}" height="${yukseklik - 1}" rx="4.5" fill="${t.bg}" />
  <text x="25" y="35" class="baslik">Bu Hafta Kod Yazarken</text>
  <text x="25" y="62" class="ozet">Toplam: ${sure(toplamSaniye)}</text>
  <text x="${GENISLIK - 25}" y="62" class="aralik" text-anchor="end">${kacis(aralik)}</text>
  ${icerik}
</svg>
`;
}

mkdirSync("profile", { recursive: true });
for (const [ad, tema] of Object.entries(TEMALAR)) {
    writeFileSync(`profile/wakatime-${ad}.svg`, kart(tema));
}
console.log(`Toplam ${sure(toplamSaniye)}, ${enCok.length} dil: ${enCok.map((d) => d.ad).join(", ") || "-"}`);
