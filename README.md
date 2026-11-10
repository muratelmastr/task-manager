# Ekip Görev Takibi

Ekip görevlerini Excel yerine tarayıcıda takip etmek için tek sayfalık, kurulum gerektirmeyen bir HTML uygulaması.

🔗 **Canlı sayfa:** https://muratelmastr.github.io/task-manager/

## Özellikler

- **Excel benzeri satır içi düzenleme:** Alan, Görev, Sahip, Durum ve Tamamlanma Tarihi doğrudan tabloda düzenlenir.
- **Parametrik listeler:** Alan, Sahip ve Durum değerleri listeden seçilir; **⚙ Ayarlar** ekranından eklenip yeniden adlandırılabilir, sıralanabilir ve silinebilir.
  - Yeniden adlandırma mevcut görevlere de yansır.
  - Görevlerde kullanılan değerler silinemez.
  - `Tamamlandı` durumu sabittir; değiştirilemez/silinemez.
- **Tamamlanan görevler silinmez:** Sayfa açıldığında yalnızca `Durum ≠ Tamamlandı` olan görevler görünür. **Tamamlananları göster** seçeneği (veya Durum filtresinde `Tamamlandı`) ile görülebilir. Tamamlanan görevlerin silme butonu kapalıdır; açık görevler onay ile silinebilir.
- **Tarih uyarıları** (yalnızca tamamlanmamış görevler için):
  - 🔴 Kırmızı: Tamamlanma tarihine **3 günden az** kaldı veya tarih **geçti**
  - 🟡 Sarı: Tamamlanma tarihine **1 haftadan az** kaldı
- **Filtreleme ve sıralama:** Alan/Sahip/Durum filtreleri, metin arama ve sütun başlığına tıklayarak sıralama.
- **Yedekleme:** **Yedek Al (JSON)** / **Yedekten Yükle** ve **Excel'e Aktar** (.xlsx – "Görevler" ve "Listeler" sayfaları).

## Veri saklama – önemli

Veriler sunucuya **gönderilmez**, yalnızca kullandığınız tarayıcının `localStorage` alanında saklanır. Bu nedenle:

- Farklı tarayıcı/bilgisayarda veriler görünmez; taşımak için **Yedek Al** → diğer tarafta **Yedekten Yükle** kullanın.
- Tarayıcı verilerini temizlemek görevleri siler. **Düzenli olarak JSON yedeği alın** (sayfanın altında son yedek tarihi görünür; 7 günden eski ise kırmızı uyarı verir).

## Yerel kullanım

Depoyu indirip `index.html` dosyasını tarayıcıda açmanız yeterlidir. Excel'e aktarma için internet bağlantısı gerekir (SheetJS kütüphanesi CDN'den yüklenir).

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa yapısı |
| `styles.css` | Görünüm |
| `app.js` | Uygulama mantığı (veri, tablo, filtreler, ayarlar, içe/dışa aktarma) |
