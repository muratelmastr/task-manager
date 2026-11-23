# Ekip Görev Takibi

Ekip görevlerini Excel yerine tarayıcıda takip etmek için tek sayfalık, kurulum gerektirmeyen bir HTML uygulaması. Ekip üyeleri kendi e-posta ve şifreleriyle giriş yapar.

🔗 **Canlı sayfa:** https://muratelmastr.github.io/task-manager/

## Özellikler

- **Sol menü (sidebar):** Tüm gezinme soldaki menüde toplanır: **Görevler** (Liste, Board), **Timesheet** (Girişler, Rapor – yalnızca kullanıcı girişli modda), altta **Veri** (Excel'e Aktar / Yedek Al / Yedekten Yükle), **Ayarlar**, eşitleme durumu ve profil (Şifre değiştir, Çıkış yap). Seçilen sayfa hatırlanır. Masaüstünde menü ⊟ düğmesiyle yalnızca ikonlara daraltılabilir (seçim hatırlanır; 1400 px'ten dar ekranlarda varsayılan olarak daraltılmış açılır). Mobilde sol üstteki **☰** ile açılır. Sayfanın üstünde sayfa başlığı ve **Yeni Görev** / **Zaman gir** düğmesi yer alır.
  - **Liste:** Excel benzeri satır içi düzenleme; Alan, Görev, Sahip, Durum, Öncelik ve Tamamlanma Tarihi doğrudan tabloda düzenlenir. **No** sütunundaki görev numarasına veya satır sonundaki ↗ düğmesine tıklayınca görev detayı açılır.
  - **Board:** Görevler Durum sütunlarında kart olarak görünür. Kartı başka sütuna **sürükleyerek** durumunu değiştirebilir, karta **tıklayarak** detayını açabilirsiniz. Filtreler, arama ve renklendirme board'da da geçerlidir; gizli tamamlanan görev sayısı "Tamamlandı" sütununda gösterilir.
- **Parametrik listeler:** Alan, Sahip ve Durum değerleri listeden seçilir; **⚙ Ayarlar** ekranından eklenip yeniden adlandırılabilir, sıralanabilir ve silinebilir (girişli modda Sahip listesi kullanıcı hesaplarından gelir).
  - Yeniden adlandırma mevcut görevlere de yansır.
  - Görevlerde kullanılan değerler silinemez.
  - `Tamamlandı` durumu sabittir; değiştirilemez/silinemez.
- **Öncelik:** Her görevin önceliği **Yüksek / Orta / Düşük** olarak seçilir (sabit liste). Yeni görevler varsayılan olarak **Orta** ile açılır; zorunlu değildir, "Belirtilmemiş" bırakılabilir. Board'da kartın sağ üst köşesinde, listede ayrı bir sütunda gösterilir ve sütun başlığından sıralanabilir.
- **Oluşturma Tarihi:** Görev oluşturulduğu anda tarih ve saat otomatik kaydedilir; değiştirilemez. Listede ve kart üzerinde gösterilmez, görev detayında görüntülenir.
- **Görev numarası:** Her görev kalıcı bir numara alır (`#1, #2…`); mevcut görevler oluşturma tarihine göre numaralanır. Numara kartın sol üstünde, listede **No** sütununda ve detay penceresinin başlığında görünür; aranabilir (`#12`) ve sıralanabilir. Numaralar değişmez, silinen görevin numarası tekrar kullanılmaz ve aynı anda görev açan iki kişi aynı numarayı alamaz.
- **Görev detayı:** Geniş pencerede solda açıklama ve ekler, sağda alanlar (Alan, Sahip, Durum, Öncelik, tarihler, Oluşturan) yer alır; mobilde tek sütundur.
- **Açıklama (zengin metin):** Kalın, italik, altı/üstü çizili, başlık, madde/numaralı liste, alıntı, kod bloğu, bağlantı (Ctrl+K) ve biçimi temizle. Word/e-postadan yapıştırılan metin güvenli biçimde temizlenir (yalnızca bu biçimler korunur). Aynı açıklamayı iki kişi aynı anda düzenlerse kaydederken uyarı çıkar. Açıklaması olan görevlerde kart ve satırda ≡ simgesi görünür.
- **Ekler:** Görev detayında **Dosya ekle** veya sürükle-bırak ile dosya eklenir (dosya başına **en fazla 10 MB**). Tüm kullanıcılar indirebilir; ekleri yalnızca **yükleyen kişi** silebilir. Ek sayısı kart ve satırda 📎 ile gösterilir. Görev silinirse açıklaması ve ekleri de silinir. Ekler kullanıcı girişli ortak veritabanı modunda kullanılabilir.
- **Tamamlanan görevler silinmez:** Sayfa açıldığında yalnızca `Durum ≠ Tamamlandı` olan görevler görünür. **Tamamlananları göster** seçeneği (veya Durum filtresinde `Tamamlandı`) ile görülebilir. Tamamlanan görevlerin silme butonu kapalıdır; açık görevler onay ile silinebilir.
- **Tarih uyarıları** (yalnızca tamamlanmamış görevler için):
  - 🔴 Kırmızı: Tamamlanma tarihine **3 günden az** kaldı veya tarih **geçti**
  - 🟡 Sarı: Tamamlanma tarihine **1 haftadan az** kaldı
- **Filtreleme ve sıralama:** Alan/Sahip/Durum filtrelerinde **birden fazla değer** işaretlenebilir (aynı filtrede seçilenlerden herhangi biri, farklı filtreler birlikte uygulanır; hiçbiri seçili değilse "Tümü"). Metin arama ve sütun başlığına tıklayarak sıralama. Board'da Durum filtresi yalnızca seçilen sütunları gösterir.
- **Kritik / yaklaşan kısayolu:** Filtrelerin altındaki **kritik** (kırmızı) veya **yaklaşan** (sarı) etiketine tıklayınca yalnızca o gruptaki açık görevler gösterilir; diğer filtrelerle birlikte çalışır. Tekrar tıklamak veya "Filtreleri temizle" filtreyi kaldırır.
- **Timesheet (zaman girişi):** Kullanıcılar bir göreve harcadıkları süreyi girer.
  - **Giriş:** Görev (aranabilir liste – numara, ad veya alan; kendi görevleriniz üstte; açık görevler ve son 30 günde tamamlananlar), **Süre** (saat; `0,5`, `2`, `1,75` gibi – 0,25 saatlik adımlarla, giriş başına ve kişi başına günde en fazla 24 saat), **Tarih** (varsayılan bugün; en fazla 30 gün geriye, gelecek tarih seçilemez) ve **Not** (en fazla 200 karakter).
  - **Girişler sekmesi:** Seçili dönemin girişleri günlere göre gruplu, gün ve dönem toplamlarıyla listelenir. Varsayılan olarak **Benim girişlerim** açıktır; kapatınca tüm ekibin girişleri kişi/alan filtreleriyle görülebilir.
  - **Düzenleme:** Herkes yalnızca **kendi** girişlerini, tarihi son 30 gün içindeyse düzenleyip silebilir.
  - **Rapor sekmesi:** Dönem (Bu ay – varsayılan, Geçen ay, Bu hafta, Son 30 gün, Özel aralık), kişi ve alan filtreleri; toplam süre/giriş/kişi/görev özeti; **kişi**, **alan** ve **görev** bazında toplam saat ve pay çubuğu; **kişi × alan** çapraz tablosu ve **Excel'e Aktar** (Girişler, Kişi, Alan, Görev, Kişi x Alan sayfaları).
  - **Görev detayı:** Görevin toplam harcanan süresi ve kişi dağılımı gösterilir; **Zaman gir** ile doğrudan o göreve giriş yapılır. Zaman girişi olan görevler silinemez.
- **Yedekleme:** **Yedek Al (JSON)** / **Yedekten Yükle** ve **Excel'e Aktar** (.xlsx – "Görevler" ve "Listeler" sayfaları; No ve düz metin Açıklama sütunlarıyla). JSON yedeği açıklamaları içerir; **ekler yedeğe dahil değildir**.


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
  - **Şifre değiştir:** Sol menünün altındaki profil menüsünden kendi adresinize şifre değiştirme bağlantısı gönderilir.
  - **Çıkış yap:** Oturum ve tarayıcıdaki görev kopyası silinir.
- **Erişim:** Yalnızca veritabanındaki `/users` listesinde e-postası bulunan kullanıcılar veriyi görebilir ve değiştirebilir. Hesabı olup listede olmayan biri giriş yaparsa "erişimi yok" uyarısı alır.
- **Sahip listesi = kullanıcılar:** Sahip değerleri `/users` listesinden (sıra alanına göre) otomatik oluşur; Ayarlar'da salt okunurdur. Kullanıcı eklemeden önceki isimler ("Murat E.", "Murat Elmas" gibi) tek bir kullanıcıya açıkça uyuyorsa otomatik olarak kullanıcı adına çevrilir.
- **Oluşturan:** Yeni görevlerde görevi oluşturan kullanıcı kaydedilir ve görev penceresinde "Oluşturan" olarak gösterilir (sonradan değiştirilemez). Liste ve kartlarda gösterilmez.
- **Benim görevlerim:** Araç çubuğundaki düğme, Sahip filtresini giriş yapan kullanıcıya ayarlar; tekrar tıklayınca kaldırır.
- Her değişiklik **otomatik olarak** kaydedilir; tüm ekip aynı listeyi görür. Başkalarının değişiklikleri 30 saniyede bir ve sayfaya dönüldüğünde çekilir.
- Bağlantı koparsa değişiklikler tarayıcıda bekletilir ("Çevrimdışı") ve bağlantı gelince gönderilir. Sol menünün altında eşitleme durumu görünür.
- Veritabanı kuralları (`database.rules.json`) ayrıca şunları engeller: tüm verinin tek seferde silinmesi, **Tamamlandı** görevlerin silinmesi, listelerin silinmesi, "Oluşturan" bilgisinin veya görev numarasının değiştirilmesi, aynı numaranın iki göreve verilmesi, başkasının yüklediği ekin silinmesi, başkası adına zaman girişi yapılması, başkasının veya 30 günden eski girişlerin değiştirilmesi, 0,25 adımına uymayan ya da 24 saati aşan süreler ve hatalı biçimli kayıtlar.

> Zaman girişlerinde `gorevNo`, `gorevAdi` ve `alan` görevin o anki kopyasıdır; görev sonradan değişse de rapor okunabilir kalır. Günlük 24 saat toplam sınırı uygulama tarafından denetlenir.

Veri yapısı:

| Yol | İçerik |
|---|---|
| `/tasks/{id}` | `id, gorev, alan, sahip, durum, oncelik, tamamlanmaTarihi (YYYY-MM-DD), completedAt, createdAt, updatedAt, createdBy, no, aciklamaVar, ekSayisi` |
| `/lists/{alan\|sahip\|durum}` | Değerler, her satırda bir değer olacak şekilde metin |
| `/users/{e-posta anahtarı}` | `ad, soyad, kullaniciAdi, email, sira` – yalnızca Firebase konsolundan düzenlenir |
| `/taskNumbers/{no}` | Numarayı alan görevin anahtarı. Yalnızca bir kez yazılabilir; numaraların benzersiz olmasını sağlar. |
| `/details/{id}` | `aciklama` (temizlenmiş HTML, en fazla 100.000 karakter), `updatedAt`, `updatedBy` – yalnızca detay açılınca okunur |
| `/attachments/{id}/{dosyaId}` | `ad, boyut, tur, yukleyen, yuklenmeTarihi, parca` |
| `/files/{id}/{dosyaId}` | `yukleyen`, `p` – dosyanın 384 KB'lık parçaları (base64) |
| `/timesheets/{girişId}` | `gorevId, kullanici, tarih (YYYY-MM-DD), gun, saat, not, gorevNo, gorevAdi, alan, createdAt, updatedAt` – `tarih` ve `gorevId` üzerinde indeksli; yalnızca seçili dönem veya görev için sorgulanır |

> Açıklama ve dosyalar görev kaydından ayrı tutulur; liste her 30 saniyede yenilenirken yalnızca küçük görev kayıtları indirilir. Görev kaydındaki `aciklamaVar` / `ekSayisi` alanları kart ve satırdaki simgeler içindir.

> **Kota:** Ücretsiz planda veritabanı toplam 1 GB'tır; base64 nedeniyle dosyalar yaklaşık 1,33 kat yer kaplar (≈ 750 MB dosya). Kullanımı Firebase konsolunda **Realtime Database → Usage** ekranından izleyebilirsiniz.

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
| `timesheet.js` | Timesheet: zaman girişleri, giriş penceresi ve raporlar |
| `config.js` | Veritabanı adresi (`databaseUrl`) ve Web API anahtarı (`apiKey`) |
| `database.rules.json` | Firebase konsoluna yapıştırılacak veritabanı kuralları |