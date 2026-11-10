# Ekip Görev Takibi

Ekip görevlerini Excel yerine tarayıcıda takip etmek için tek sayfalık, kurulum gerektirmeyen bir HTML uygulaması.

🔗 **Canlı sayfa:** https://muratelmastr.github.io/task-manager/

## Özellikler

- **Liste / Board görünümü:** Sayfanın üstündeki **☰ Liste | ▦ Board** düğmesiyle geçiş yapılır; seçim hatırlanır.
  - **Liste:** Excel benzeri satır içi düzenleme; Alan, Görev, Sahip, Durum ve Tamamlanma Tarihi doğrudan tabloda düzenlenir.
  - **Board:** Görevler Durum sütunlarında kart olarak görünür. Kartı başka sütuna **sürükleyerek** durumunu değiştirebilir, karta **tıklayarak** düzenleyebilirsiniz. Filtreler, arama ve renklendirme board'da da geçerlidir; gizli tamamlanan görev sayısı "Tamamlandı" sütununda gösterilir.
- **Parametrik listeler:** Alan, Sahip ve Durum değerleri listeden seçilir; **⚙ Ayarlar** ekranından eklenip yeniden adlandırılabilir, sıralanabilir ve silinebilir.
  - Yeniden adlandırma mevcut görevlere de yansır.
  - Görevlerde kullanılan değerler silinemez.
  - `Tamamlandı` durumu sabittir; değiştirilemez/silinemez.
- **Tamamlanan görevler silinmez:** Sayfa açıldığında yalnızca `Durum ≠ Tamamlandı` olan görevler görünür. **Tamamlananları göster** seçeneği (veya Durum filtresinde `Tamamlandı`) ile görülebilir. Tamamlanan görevlerin silme butonu kapalıdır; açık görevler onay ile silinebilir.
- **Tarih uyarıları** (yalnızca tamamlanmamış görevler için):
  - 🔴 Kırmızı: Tamamlanma tarihine **3 günden az** kaldı veya tarih **geçti**
  - 🟡 Sarı: Tamamlanma tarihine **1 haftadan az** kaldı
- **Filtreleme ve sıralama:** Alan/Sahip/Durum filtreleri, metin arama ve sütun başlığına tıklayarak sıralama.
- **Yedekleme:** **💾 Dosyaya otomatik kaydet**, **Yedek Al (JSON)** / **Yedekten Yükle** ve **Excel'e Aktar** (.xlsx – "Görevler" ve "Listeler" sayfaları).

## Veri saklama – önemli

Veriler sunucuya **gönderilmez**; tarayıcının `localStorage` alanında ve (bağlarsanız) bilgisayarınızdaki bir JSON dosyasında saklanır.

### Dosyaya otomatik kayıt (önerilen)

1. Üstteki **💾 Dosyaya otomatik kaydet** düğmesine tıklayın → **Yeni dosya oluştur** ile örn. OneDrive klasörünüzde `gorevler.json` oluşturun.
2. Bundan sonra her değişiklik otomatik olarak bu dosyaya yazılır; düğme **✓ gorevler.json** olarak görünür.
3. Tarayıcıyı kapatıp açtığınızda düğme **⚠ yeniden bağlan** gösterebilir; tıklayıp izin vermeniz yeterlidir.
4. Tarayıcı verileri silinmişse (InPrivate pencere, kapanışta temizleme vb.) **Mevcut dosyayı aç** ile aynı dosyayı seçin; tüm görevler geri yüklenir.
5. Dosya başka bir bilgisayardan (OneDrive) güncellenirse sekmeye döndüğünüzde yeni veriler yüklenir. Her iki tarafta da farklı değişiklik varsa hangisinin kullanılacağı sorulur.

Bu özellik **Microsoft Edge ve Google Chrome**'da çalışır (Firefox/Safari desteklemez; orada JSON yedeğini kullanın).

### Veriler neden kayboluyor?

`localStorage` normalde kalıcıdır. Sayfa kapatılınca veriler gidiyorsa genellikle sebep şunlardır:

- Sayfa **InPrivate / gizli** pencerede açılıyordur.
- Edge'de **Kapatırken tarama verilerini temizle** → "Tanımlama bilgileri ve diğer site verileri" açıktır (`edge://settings/clearBrowsingDataOnClose`) veya şirket politikası bunu zorunlu kılıyordur.

### Diğer notlar

- Farklı tarayıcı/bilgisayarda veriler görünmez; aynı JSON dosyasını **Mevcut dosyayı aç** ile bağlayın ya da **Yedek Al** → **Yedekten Yükle** kullanın.
- Ek güvenlik için ara sıra **Yedek Al (JSON)** ile ayrı bir yedek alın (sayfanın altında son yedek tarihi görünür).

## Yerel kullanım

Depoyu indirip `index.html` dosyasını tarayıcıda açmanız yeterlidir. Excel'e aktarma için internet bağlantısı gerekir (SheetJS kütüphanesi CDN'den yüklenir).

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa yapısı |
| `styles.css` | Görünüm |
| `app.js` | Uygulama mantığı (veri, tablo, filtreler, ayarlar, içe/dışa aktarma) |
