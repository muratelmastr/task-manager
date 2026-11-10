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
- **Yedekleme:** **Yedek Al (JSON)** / **Yedekten Yükle** ve **Excel'e Aktar** (.xlsx – "Görevler" ve "Listeler" sayfaları).


## Veri saklama

Uygulamanın iki çalışma modu vardır; hangisinin kullanılacağı `config.js` dosyasındaki `databaseUrl` değerine göre belirlenir.

### ☁ Ortak veritabanı modu (önerilen – girişsiz, otomatik kayıt)

`databaseUrl` doldurulduğunda veriler ekibin **Firebase Realtime Database** veritabanında saklanır:

- **Giriş gerekmez:** Bağlantıya sahip herkes görevleri görebilir ve düzenleyebilir.
- Her değişiklik (ekleme, düzenleme, durum değişikliği, sürükle-bırak, ayarlar) **otomatik olarak** kaydedilir; manuel yedek gerekmez.
- Tüm ekip aynı listeyi görür. Başkalarının değişiklikleri 30 saniyede bir ve sayfaya dönüldüğünde otomatik çekilir.
- Bağlantı koparsa değişiklikler tarayıcıda bekletilir ("Çevrimdışı" durumu) ve bağlantı gelince gönderilir.
- Üst çubukta eşitleme durumu görünür: **Kaydediliyor… / Kaydedildi / Çevrimdışı / Hata**.
- Veritabanı kuralları (`database.rules.json`) şunları engeller: tüm verinin tek seferde silinmesi, **Tamamlandı** durumundaki görevlerin silinmesi, Alan/Sahip/Durum listelerinin silinmesi ve hatalı biçimli kayıtlar.

Veri yapısı:

| Yol | İçerik |
|---|---|
| `/tasks/{id}` | `id, gorev, alan, sahip, durum, tamamlanmaTarihi (YYYY-MM-DD), completedAt, createdAt, updatedAt` |
| `/lists/{alan\|sahip\|durum}` | Değerler, her satırda bir değer olacak şekilde metin |

> Bu tarayıcıda daha önce yerel olarak girilmiş görevler varsa, ilk açılışta "ortak listeye aktarılsın mı?" diye sorulur.

> ⚠️ **Güvenlik:** Giriş olmadığı için veritabanı adresini (veya sayfa bağlantısını) bilen herkes verileri okuyup değiştirebilir; depo herkese açık olduğundan adres de herkese açıktır. **Gizli/kişisel veri saklamayın.** Firebase konsolundan veriyi düzenli olarak dışa aktarabilir veya uygulamadaki **Yedek Al (JSON)** düğmesini kullanabilirsiniz.

### 💻 Yerel mod

`databaseUrl` boşsa veriler yalnızca kullandığınız tarayıcının `localStorage` alanında saklanır (sunucuya gönderilmez). Farklı tarayıcıda görünmez ve tarayıcı verileri temizlenirse kaybolur; bu modda **Yedek Al (JSON)** ile düzenli yedek alın.

## Firebase kurulumu (bir kerelik, ücretsiz)

1. https://console.firebase.google.com → **Proje ekle** (ör. `ekip-gorev-takibi`). Google Analytics'i kapatabilirsiniz.
2. Sol menü **Derleme (Build) → Realtime Database → Veritabanı oluştur**
   - Konum: **Belçika (europe-west1)**
   - **Kilitli modda başlat** seçin.
3. **Kurallar (Rules)** sekmesine bu depodaki `database.rules.json` dosyasının içeriğini yapıştırıp **Yayınla**'ya tıklayın.
4. **Veri (Data)** sekmesinin üstündeki veritabanı adresini kopyalayın (ör. `https://ekip-gorev-takibi-default-rtdb.europe-west1.firebasedatabase.app`) ve `config.js` dosyasına yazın:

```js
window.TASK_MANAGER_CONFIG = {
  databaseUrl: 'https://ekip-gorev-takibi-default-rtdb.europe-west1.firebasedatabase.app',
};
```

Değişikliği `main` dalına gönderdiğinizde GitHub Pages sayfası ortak veritabanı modunda açılır. Ücretsiz Spark planı (1 GB depolama, aylık 10 GB indirme) bir ekip görev listesi için fazlasıyla yeterlidir; kredi kartı gerekmez.

## Yerel kullanım

Depoyu indirip `index.html` dosyasını tarayıcıda açmanız yeterlidir. Excel'e aktarma için internet bağlantısı gerekir (SheetJS kütüphanesi CDN'den yüklenir).

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa yapısı |
| `styles.css` | Görünüm |
| `app.js` | Uygulama mantığı (veri, tablo, filtreler, ayarlar, içe/dışa aktarma, bulut eşitleme) |
| `cloud.js` | Firebase Realtime Database REST istemcisi (SDK veya API anahtarı gerekmez) |
| `config.js` | Veritabanı adresi (`databaseUrl`) |
| `database.rules.json` | Firebase konsoluna yapıştırılacak veritabanı kuralları |