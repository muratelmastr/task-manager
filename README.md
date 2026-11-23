# Ekip Görev Takibi

Ekip görevlerini Excel yerine tarayıcıda takip etmek için tek sayfalık, kurulum gerektirmeyen bir HTML uygulaması. Ekip üyeleri kendi e-posta ve şifreleriyle giriş yapar.

🔗 **Canlı sayfa:** https://muratelmastr.github.io/task-manager/

## Özellikler

- **Liste / Board görünümü:** Sayfanın üstündeki **☰ Liste | ▦ Board** düğmesiyle geçiş yapılır; seçim hatırlanır.
  - **Liste:** Excel benzeri satır içi düzenleme; Alan, Görev, Sahip, Durum, Öncelik ve Tamamlanma Tarihi doğrudan tabloda düzenlenir.
  - **Board:** Görevler Durum sütunlarında kart olarak görünür. Kartı başka sütuna **sürükleyerek** durumunu değiştirebilir, karta **tıklayarak** düzenleyebilirsiniz. Filtreler, arama ve renklendirme board'da da geçerlidir; gizli tamamlanan görev sayısı "Tamamlandı" sütununda gösterilir.
- **Parametrik listeler:** Alan, Sahip ve Durum değerleri listeden seçilir; **⚙ Ayarlar** ekranından eklenip yeniden adlandırılabilir, sıralanabilir ve silinebilir (girişli modda Sahip listesi kullanıcı hesaplarından gelir).
  - Yeniden adlandırma mevcut görevlere de yansır.
  - Görevlerde kullanılan değerler silinemez.
  - `Tamamlandı` durumu sabittir; değiştirilemez/silinemez.
- **Öncelik:** Her görevin önceliği **Yüksek / Orta / Düşük** olarak seçilir (sabit liste). Yeni görevler varsayılan olarak **Orta** ile açılır; zorunlu değildir, "Belirtilmemiş" bırakılabilir. Board'da kartın sağ üst köşesinde, listede ayrı bir sütunda gösterilir ve sütun başlığından sıralanabilir.
- **Oluşturma Tarihi:** Görev oluşturulduğu anda tarih ve saat otomatik kaydedilir; değiştirilemez. Listede ve kart üzerinde gösterilmez, board'da karta tıklayınca açılan görev penceresinde görüntülenir.
- **Tamamlanan görevler silinmez:** Sayfa açıldığında yalnızca `Durum ≠ Tamamlandı` olan görevler görünür. **Tamamlananları göster** seçeneği (veya Durum filtresinde `Tamamlandı`) ile görülebilir. Tamamlanan görevlerin silme butonu kapalıdır; açık görevler onay ile silinebilir.
- **Tarih uyarıları** (yalnızca tamamlanmamış görevler için):
  - 🔴 Kırmızı: Tamamlanma tarihine **3 günden az** kaldı veya tarih **geçti**
  - 🟡 Sarı: Tamamlanma tarihine **1 haftadan az** kaldı
- **Filtreleme ve sıralama:** Alan/Sahip/Durum filtrelerinde **birden fazla değer** işaretlenebilir (aynı filtrede seçilenlerden herhangi biri, farklı filtreler birlikte uygulanır; hiçbiri seçili değilse "Tümü"). Metin arama ve sütun başlığına tıklayarak sıralama. Board'da Durum filtresi yalnızca seçilen sütunları gösterir.
- **Kritik / yaklaşan kısayolu:** Filtrelerin altındaki **kritik** (kırmızı) veya **yaklaşan** (sarı) etiketine tıklayınca yalnızca o gruptaki açık görevler gösterilir; diğer filtrelerle birlikte çalışır. Tekrar tıklamak veya "Filtreleri temizle" filtreyi kaldırır.
- **Yedekleme:** **Yedek Al (JSON)** / **Yedekten Yükle** ve **Excel'e Aktar** (.xlsx – "Görevler" ve "Listeler" sayfaları).


## Veri saklama

Uygulamanın çalışma modu `config.js` dosyasındaki değerlere göre belirlenir:

| `config.js` | Mod |
|---|---|
| `databaseUrl` + `apiKey` | ☁ Ortak veritabanı, **kullanıcı girişi ile** (önerilen) |
| yalnızca `databaseUrl` | ☁ Ortak veritabanı, girişsiz (eski kurulumlar; yeni kurallarla çalışmaz) |
| boş | 💻 Yerel mod (yalnızca bu tarayıcı) |

### ☁ Ortak veritabanı modu (kullanıcı girişi ile)

Veriler ekibin **Firebase Realtime Database** veritabanında saklanır; giriş **Firebase Authentication** (e-posta/şifre) ile yapılır.

- **Giriş:** Sayfa açıldığında giriş ekranı gelir; her ekip üyesi kendi **e-posta adresi ve şifresi** ile giriş yapar. Oturum, **Çıkış yap** denilene kadar açık kalır.
  - **Şifremi unuttum:** E-posta adresine şifre sıfırlama bağlantısı gönderilir.
  - **Şifre değiştir:** Sağ üstteki kullanıcı menüsünden kendi adresinize şifre değiştirme bağlantısı gönderilir.
  - **Çıkış yap:** Oturum ve tarayıcıdaki görev kopyası silinir.
- **Erişim:** Yalnızca veritabanındaki `/users` listesinde e-postası bulunan kullanıcılar veriyi görebilir ve değiştirebilir. Hesabı olup listede olmayan biri giriş yaparsa "erişimi yok" uyarısı alır.
- **Sahip listesi = kullanıcılar:** Sahip değerleri `/users` listesinden (sıra alanına göre) otomatik oluşur; Ayarlar'da salt okunurdur. Kullanıcı eklemeden önceki isimler ("Murat E.", "Murat Elmas" gibi) tek bir kullanıcıya açıkça uyuyorsa otomatik olarak kullanıcı adına çevrilir.
- **Oluşturan:** Yeni görevlerde görevi oluşturan kullanıcı kaydedilir ve görev penceresinde "Oluşturan" olarak gösterilir (sonradan değiştirilemez). Liste ve kartlarda gösterilmez.
- **Benim görevlerim:** Araç çubuğundaki düğme, Sahip filtresini giriş yapan kullanıcıya ayarlar; tekrar tıklayınca kaldırır.
- Her değişiklik **otomatik olarak** kaydedilir; tüm ekip aynı listeyi görür. Başkalarının değişiklikleri 30 saniyede bir ve sayfaya dönüldüğünde çekilir.
- Bağlantı koparsa değişiklikler tarayıcıda bekletilir ("Çevrimdışı") ve bağlantı gelince gönderilir. Üst çubukta eşitleme durumu görünür.
- Veritabanı kuralları (`database.rules.json`) ayrıca şunları engeller: tüm verinin tek seferde silinmesi, **Tamamlandı** görevlerin silinmesi, listelerin silinmesi, "Oluşturan" bilgisinin değiştirilmesi ve hatalı biçimli kayıtlar.

Veri yapısı:

| Yol | İçerik |
|---|---|
| `/tasks/{id}` | `id, gorev, alan, sahip, durum, oncelik, tamamlanmaTarihi (YYYY-MM-DD), completedAt, createdAt, updatedAt, createdBy` |
| `/lists/{alan\|sahip\|durum}` | Değerler, her satırda bir değer olacak şekilde metin |
| `/users/{e-posta anahtarı}` | `ad, soyad, kullaniciAdi, email, sira` – yalnızca Firebase konsolundan düzenlenir |

> `oncelik` alanı yalnızca **Orta** dışındaki değerler için yazılır (`Yüksek`, `Düşük` veya boş = belirtilmemiş); alan yoksa öncelik **Orta** kabul edilir. `createdBy` giriş özelliğinden önce oluşturulan görevlerde yoktur.

> `/users` anahtarı küçük harfe çevrilmiş e-postadır ve içindeki noktalar `%2E` olarak yazılır (ör. `murate@logosoft%2Ecom%2Etr`).

> Bu tarayıcıda daha önce yerel olarak girilmiş görevler varsa, ilk açılışta "ortak listeye aktarılsın mı?" diye sorulur.

### 💻 Yerel mod

`databaseUrl` boşsa veriler yalnızca kullandığınız tarayıcının `localStorage` alanında saklanır (sunucuya gönderilmez, giriş yoktur). Farklı tarayıcıda görünmez ve tarayıcı verileri temizlenirse kaybolur; bu modda **Yedek Al (JSON)** ile düzenli yedek alın.

## Firebase kurulumu (bir kerelik, ücretsiz)

1. https://console.firebase.google.com → **Proje ekle** (ör. `ekip-gorev-takibi`). Google Analytics'i kapatabilirsiniz.
2. **Realtime Database:** Sol menü **Derleme (Build) → Realtime Database → Veritabanı oluştur**
   - Konum: **Belçika (europe-west1)**
   - **Kilitli modda başlat** seçin.
3. **Authentication:** **Derleme → Authentication → Başlayın → Sign-in method → E-posta/Şifre**'yi etkinleştirin.
   - **Authentication → Settings → User actions** altında **Enable create (sign-up)** seçeneğini kapatın; böylece hesapları yalnızca siz oluşturabilirsiniz.
4. **Kullanıcı hesapları:** **Authentication → Users → Add user** ile her ekip üyesi için e-posta ve şifre (en az 6 karakter) girin.
5. **Kullanıcı listesi:** **Realtime Database → Veri** sekmesinde `users` düğümünü oluşturup **⋮ → JSON içe aktar** ile aşağıdaki biçimde bir dosya yükleyin:

```json
{
  "murate@logosoft%2Ecom%2Etr": { "ad": "Murat", "soyad": "Elmas", "kullaniciAdi": "Murat", "email": "murate@logosoft.com.tr", "sira": 1 }
}
```

   Yeni bir ekip üyesi için hem 4. adımdaki hesabı hem de buradaki kaydı ekleyin; ayrılan biri için ikisini de silin (veya hesabı devre dışı bırakın).
6. **Kurallar:** **Kurallar (Rules)** sekmesine bu depodaki `database.rules.json` içeriğini yapıştırıp **Yayınla**'ya tıklayın.
7. **config.js:** Veri sekmesindeki veritabanı adresini ve **Proje ayarları → Genel → Web API anahtarı** değerini yazın:

```js
window.TASK_MANAGER_CONFIG = {
  databaseUrl: 'https://ekip-gorev-takibi-default-rtdb.europe-west1.firebasedatabase.app',
  apiKey: 'AIza…',
};
```

> Web API anahtarı **gizli değildir**; yalnızca Firebase projesini tanımlar. Verileri koruyan, giriş zorunluluğu ve veritabanı kurallarıdır. Şifreler bu depoda veya uygulama kodunda hiçbir zaman yer almaz.

Değişikliği `main` dalına gönderdiğinizde GitHub Pages sayfası güncellenir. Ücretsiz Spark planı (1 GB depolama, aylık 10 GB indirme, 50.000 aylık aktif kullanıcıya kadar Authentication) bir ekip görev listesi için fazlasıyla yeterlidir; kredi kartı gerekmez.

## Yerel kullanım

Depoyu indirip `index.html` dosyasını tarayıcıda açmanız yeterlidir. Excel'e aktarma için internet bağlantısı gerekir (SheetJS kütüphanesi CDN'den yüklenir).

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa yapısı |
| `styles.css` | Görünüm |
| `app.js` | Uygulama mantığı (veri, tablo, filtreler, ayarlar, içe/dışa aktarma, bulut eşitleme, giriş akışı) |
| `auth.js` | Firebase Authentication REST istemcisi (e-posta/şifre girişi, şifre sıfırlama, oturum yenileme) |
| `cloud.js` | Firebase Realtime Database REST istemcisi (SDK gerekmez) |
| `config.js` | Veritabanı adresi (`databaseUrl`) ve Web API anahtarı (`apiKey`) |
| `database.rules.json` | Firebase konsoluna yapıştırılacak veritabanı kuralları |