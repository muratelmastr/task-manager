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

Uygulamanın iki çalışma modu vardır; hangisinin kullanılacağı `config.js` dosyasına göre belirlenir.

### ☁ SharePoint modu (önerilen – otomatik kayıt)

`config.js` doldurulduğunda kullanıcılar **Microsoft iş hesabıyla** giriş yapar ve veriler ekibin SharePoint sitesindeki listelerde saklanır:

- Her değişiklik (ekleme, düzenleme, durum değişikliği, sürükle-bırak, ayarlar) **otomatik olarak** kaydedilir; manuel yedek gerekmez.
- Tüm ekip aynı listeyi görür. Başkalarının değişiklikleri 30 saniyede bir ve sayfaya dönüldüğünde otomatik çekilir.
- Bağlantı koparsa değişiklikler tarayıcıda bekletilir ("Çevrimdışı" durumu) ve bağlantı gelince gönderilir.
- Üst çubukta eşitleme durumu görünür: **Kaydediliyor… / Kaydedildi / Çevrimdışı / Hata**.
- SharePoint'in sürüm geçmişi sayesinde her görevin eski hâllerine SharePoint'ten ulaşılabilir.

İlk girişte uygulama siteye iki liste oluşturur (yoksa):

| Liste | Sütunlar (hepsi metin) | İçerik |
|---|---|---|
| `Gorevler` | Title (Görev), TaskId, Alan, Sahip, Durum, TamamlanmaTarihi (`YYYY-MM-DD`), CompletedAt | Her satır bir görev |
| `GorevAyarlari` | Title (`alan` / `sahip` / `durum`), Degerler (çok satırlı düz metin, her satırda bir değer) | Parametrik listeler |

> Bu tarayıcıda daha önce yerel olarak girilmiş görevler varsa, ilk girişte "SharePoint'e yüklensin mi?" diye sorulur.

### 💻 Yerel mod

`config.js` boşsa veriler yalnızca kullandığınız tarayıcının `localStorage` alanında saklanır (sunucuya gönderilmez). Farklı tarayıcıda görünmez ve tarayıcı verileri temizlenirse kaybolur; bu modda **Yedek Al (JSON)** ile düzenli yedek alın.

## SharePoint kurulumu (bir kerelik)

### 1. Entra ID'de uygulama kaydı

1. https://entra.microsoft.com → **Uygulamalar → Uygulama kayıtları → Yeni kayıt**
   - Ad: `Ekip Görev Takibi`
   - Desteklenen hesap türleri: **Yalnızca bu kuruluş dizinindeki hesaplar (Tek kiracı)**
   - Yeniden yönlendirme URI'si: platform **Tek sayfalı uygulama (SPA)**, değer `https://muratelmastr.github.io/task-manager/`
2. **Kaydet**'e tıklayın. Genel bakış sayfasındaki **Uygulama (istemci) kimliği** ve **Dizin (kiracı) kimliği** değerlerini not edin.
3. (İsteğe bağlı, yerel test için) **Kimlik doğrulama** → SPA altında `http://localhost:8080/` adresini de ekleyin.
4. **API izinleri → İzin ekle → Microsoft Graph → Temsilci izinleri** → `Sites.Manage.All` → **İzin ekle**.
   - Listeleri SharePoint'te kendiniz oluşturacaksanız (aşağıya bakın) `Sites.ReadWrite.All` yeterlidir; bu durumda `config.js` içindeki `scopes` değerini de değiştirin.
5. Kuruluşunuz kullanıcıların izin vermesine kapalıysa bir yöneticinin **"… için yönetici onayı ver"** düğmesine basması gerekir. İlk girişte "Yönetici onayı gerekli" mesajı görürseniz BT ekibinden bu onayı isteyin.

> Uygulama kaydında **istemci gizli anahtarı (secret) oluşturmayın**; tarayıcı uygulaması gizli anahtar kullanmaz. Client ID ve Tenant ID gizli bilgi değildir, depoda bulunabilir.

### 2. SharePoint sitesi

- Görevlerin saklanacağı ekip sitesini seçin (ör. `https://sirket.sharepoint.com/sites/Ekip`).
- Ekip üyelerinin bu sitede **düzenleme (Üye)** yetkisi olmalıdır. Uygulama yalnızca giriş yapan kullanıcının yetkileriyle çalışır.

### 3. `config.js`

```js
window.TASK_MANAGER_CONFIG = {
  clientId: '00000000-0000-0000-0000-000000000000', // Uygulama (istemci) kimliği
  tenantId: '00000000-0000-0000-0000-000000000000', // Dizin (kiracı) kimliği
  siteUrl: 'https://sirket.sharepoint.com/sites/Ekip',
  taskListName: 'Gorevler',
  settingsListName: 'GorevAyarlari',
  scopes: ['Sites.Manage.All'],
};
```

Değişikliği `main` dalına gönderdiğinizde GitHub Pages sayfası SharePoint modunda açılır.

### Listeleri elle oluşturma (Sites.Manage.All verilemezse)

SharePoint sitesinde **Yeni → Liste → Boş liste** ile yukarıdaki tablodaki iki listeyi aynı adlarla oluşturun ve sütunları **Tek satırlık metin** olarak ekleyin (`Degerler` sütunu **Çok satırlı metin – düz metin**). Sütun *iç adlarının* tablodakiyle birebir aynı olması gerekir; bu yüzden sütunları önce Türkçe karakter ve boşluk olmadan oluşturun.
## Yerel kullanım

Depoyu indirip `index.html` dosyasını tarayıcıda açmanız yeterlidir. Excel'e aktarma için internet bağlantısı gerekir (SheetJS kütüphanesi CDN'den yüklenir).

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa yapısı |
| `styles.css` | Görünüm |
| `app.js` | Uygulama mantığı (veri, tablo, filtreler, ayarlar, içe/dışa aktarma, SharePoint eşitleme) |
| `cloud.js` | Microsoft girişi (MSAL) ve Microsoft Graph / SharePoint erişimi |
| `config.js` | Uygulama kaydı ve SharePoint sitesi ayarları |
