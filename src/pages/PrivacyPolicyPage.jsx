import { Link } from "react-router-dom";
import PageFade from "../components/PageFade";

// In-app privacy policy — App Review requires the policy to be reachable
// inside the app. Content mirrors what the code actually does: Supabase
// (auth + database + storage) for accounts and community content, Anthropic
// for premium AI-coach replies, no analytics/tracking SDKs, no ads.
const SECTIONS = [
  {
    title: "Hangi verileri topluyoruz?",
    body: `Hesap oluşturduğunda e-posta adresini, kullanıcı adını ve görünen adını saklarız. Google veya Apple ile giriş yaparsan, bu sağlayıcıların paylaştığı ad ve e-posta bilgisini kullanırız. Uygulamada paylaştığın tarifler, fotoğraflar, videolar, yorumlar, beğeniler, kaydettiklerin, takip ilişkilerin ve direkt mesajların hesabına bağlı olarak saklanır. Market tercihi, beslenme filtresi ve tema gibi uygulama tercihleri yalnızca cihazında tutulur.`,
  },
  {
    title: "Verilerin nerede saklanıyor?",
    body: `Hesap ve topluluk verilerin, altyapı sağlayıcımız Supabase üzerinde güvenli şekilde saklanır. Fotoğraf ve videoların erişimi hesap gizlilik ayarına göre yetkilendirilir; gizli hesapların medyası yalnızca kabul edilmiş takipçilere sunulur.`,
  },
  {
    title: "Yapay zeka özellikleri",
    body: `Premium sağlık koçunu kullanırsan, koça yazdığın mesajlar ile beslenme filtren ve sepetindeki tarif adları, yanıt üretmek için yapay zeka sağlayıcımız Anthropic'e iletilir. Bir paylaşımda tarif metnini boş bırakırsan, tarif adı ve malzeme listesi tarif metni oluşturmak için yine Anthropic'e iletilir. Bu isteklere kimliğini açıklayan bir bilgi (e-posta, kullanıcı adı) eklenmez. Yapay zeka koçu genel beslenme bilgisi verir; tıbbi teşhis veya tedavi önerisi değildir.`,
  },
  {
    title: "Takip ve reklam",
    body: `Tarifim reklam göstermez, üçüncü taraf analitik veya takip SDK'sı kullanmaz ve verilerini reklam amacıyla kimseyle paylaşmaz.`,
  },
  {
    title: "Fiyat bilgileri",
    body: `Uygulamadaki market fiyat karşılaştırmaları tahmini ve temsili verilerdir; marketlerin güncel fiyatlarını birebir yansıtmayabilir.`,
  },
  {
    title: "Hesabını silme",
    body: `Ayarlar sayfasındaki "Hesabı Sil" seçeneğiyle hesabını istediğin an kalıcı olarak silebilirsin. Silme işlemi hesabını, profilini, paylaşımlarını, yorumlarını, mesajlarını ve yüklediğin medyayı kalıcı olarak kaldırır ve geri alınamaz.`,
  },
  {
    title: "İletişim",
    body: `Sorularını veya taleplerini Ayarlar sayfasındaki "Öneri Gönder" formu üzerinden bize iletebilirsin.`,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <PageFade className="flex flex-1 flex-col gap-5 px-5 py-5">
      <header>
        <Link to="/settings" className="text-xs font-semibold text-[var(--color-ink-soft)]">
          ← Ayarlar
        </Link>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-ink)]">Gizlilik Politikası</h1>
        <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">Son güncelleme: 21 Ağustos 2026</p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title} className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          <h2 className="mb-1.5 text-sm font-bold text-[var(--color-ink)]">{section.title}</h2>
          <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">{section.body}</p>
        </section>
      ))}
    </PageFade>
  );
}
