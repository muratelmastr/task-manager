# Ekip Görev Takibi

Ekip görevlerini Excel yerine tarayıcıda takip etmek için tek sayfalık, kurulum gerektirmeyen bir HTML uygulaması. Ekip üyeleri kendi e-posta ve şifreleriyle giriş yapar.

🔗 **Canlı sayfa:** https://muratelmastr.github.io/task-manager/

## Özellikler

- **Sol menü (sidebar):** Tüm gezinme soldaki menüde toplanır: **Görevler** (Liste, Board, Rapor), **Timesheet** (Girişler, Rapor – yalnızca kullanıcı girişli modda), altta **Veri** (Excel'e Aktar / Yedek Al / Yedekten Yükle), **Ayarlar**, eşitleme durumu ve profil (Şifre değiştir, Çıkış yap). Seçilen sayfa hatırlanır. Masaüstünde menü ⊟ düğmesiyle yalnızca ikonlara daraltılabilir (seçim hatırlanır; 1400 px'ten dar ekranlarda varsayılan olarak daraltılmış açılır). Mobilde sol üstteki **☰** ile açılır. Sayfanın üstünde sayfa başlığı ve **Yeni Görev** / **Zaman gir** düğmesi yer alır.
  - **Liste:** Excel benzeri satır içi düzenleme; Alan, Görev, Sahip, Durum, Öncelik ve Tamamlanma Tarihi doğrudan tabloda düzenlenir. **No** sütunundaki görev numarasına veya satır sonundaki ↗ düğmesine tıklayınca görev detayı açılır.
  - **Board:** Görevler Durum sütunlarında kart olarak görünür. Kartı başka sütuna **sürükleyerek** durumunu değiştirebilir, karta **tıklayarak** detayını açabilirsiniz. Filtreler (Durum hariç), arama ve renklendirme board'da da geçerlidir; gizli tamamlanan görev sayısı "Tamamlandı" sütununda gösterilir.
  - **Sağ tık menüsü:** Listede satıra, Board'da karta **sağ tıklayınca** (veya odaktayken Shift+F10 / Menü tuşu) görev menüsü açılır (Görev metin kutusunda tarayıcının kendi kopyala/yapıştır menüsü kalır):
    - **Kopya Oluştur:** Görevin bire bir kopyasını oluşturur ve detayını açar: Görev, Alan, Durum, Öncelik, Tamamlanma Tarihi, açıklama, ekler ve yorumlar kopyalanır; **Sahip boş** bırakılır. Kopya yeni bir numara alır, "Oluşturan" kopyayı oluşturan kişidir; tamamlanmış bir görevin kopyası ilk açık durumla açılır. Ekler ve yorumlar arka planda kopyalanır; sunucu kuralları gereği kopyadaki eklerin yükleyeni ve yorumların yazanı kopyayı oluşturan kişi olur (yorum metni ve tarihi korunur), kopyalanan yorumlar için mail gitmez. Zaman girişleri kopyalanmaz.
    - **Sil:** Satırdaki 🗑 düğmesiyle aynıdır (onay sorulur; tamamlanan ve zaman girişi olan görevler silinemez).
  - **Rapor:** Seçili dönemde kimin kaç görev üzerinde çalıştığını, kaçını kapattığını ve kaçının devam ettiğini özetler. Dönem (Bu ay – varsayılan, Geçen ay, Bu hafta, Son 30 gün, Özel aralık), kişi (Sahip, "(Atanmamış)" dahil) ve alan filtreleri; **Çalışılan / Kapatılan / Devam eden / Yeni açılan / Geciken** özet kartları; **kişi** ve **alan** bazında aynı sayılar ve kapanma oranı çubuğu; **kişi × alan** tablosu (`kapatılan / çalışılan`) ve **Excel'e Aktar** (Görevler – dönemdeki görevler, dönem sonundaki durumu ve tarihleriyle –, Kişi, Alan, Kişi x Alan sayfaları). Tüm modlarda çalışır.
    - **Çalışılan:** Sahibi o kişi olan ve dönem içinde açık olan görev (dönem bitmeden oluşturulmuş ve dönem başlamadan kapanmamış). **Kapatılan:** Dönem içinde Tamamlandı'ya alınan. **Devam eden:** Dönem sonunda hâlâ açık olan (geçmiş dönemler o günkü hâliyle görünür). Çalışılan = Kapatılan + Devam eden. **Yeni açılan:** Dönem içinde oluşturulan. **Geciken:** Devam edenlerden tamamlanma tarihi dönem sonundan (dönem sürüyorsa bugünden) önce olan.
    - Sınırlar: Sahip ve durum geçmişi tutulmadığından görev, **şu anki sahibine** sayılır; yeniden açılan görevin önceki kapanışı rapora yansımaz; tamamlanma anı bilinmeyen eski tamamlanmış görevler rapora dahil edilmez.
- **Parametrik listeler:** Alan, Sahip ve Durum değerleri listeden seçilir; **⚙ Ayarlar** ekranından eklenip yeniden adlandırılabilir, sıralanabilir ve silinebilir (girişli modda Sahip listesi kullanıcı hesaplarından gelir).
- **Yeni görev:** **Yeni Görev** düğmesi (Liste ve Board'da) görev penceresini açar. **Görev** başlığı ve **Alan** zorunludur; Alan seçilmeden görev oluşturulamaz. Alan/Sahip filtresinde seçili ilk değer pencerede hazır gelir. (Alanı boş olan eski görevler düzenlenip kaydedilebilir.)
  - Yeniden adlandırma mevcut görevlere de yansır.
  - Görevlerde kullanılan değerler silinemez.
  - `Tamamlandı` durumu sabittir; değiştirilemez/silinemez.
- **Öncelik:** Her görevin önceliği **Yüksek / Orta / Düşük** olarak seçilir (sabit liste). Yeni görevler varsayılan olarak **Orta** ile açılır; zorunlu değildir, "Belirtilmemiş" bırakılabilir. Board'da kartın sağ üst köşesinde, listede ayrı bir sütunda gösterilir ve sütun başlığından sıralanabilir.
- **Oluşturma Tarihi:** Görev oluşturulduğu anda tarih ve saat otomatik kaydedilir; değiştirilemez. Listede ve kart üzerinde gösterilmez, görev detayında görüntülenir.
- **Görev numarası:** Her görev kalıcı bir numara alır (`#1, #2…`); mevcut görevler oluşturma tarihine göre numaralanır. Numara kartın sol üstünde, listede **No** sütununda ve detay penceresinin başlığında görünür; aranabilir (`#12`) ve sıralanabilir. Numaralar değişmez, silinen görevin numarası tekrar kullanılmaz ve aynı anda görev açan iki kişi aynı numarayı alamaz.
- **Görev detayı:** Geniş pencerede solda açıklama ve ekler, sağda alanlar (Alan, Sahip, Durum, Öncelik, tarihler, Oluşturan) yer alır; mobilde tek sütundur.
- **Açıklama (zengin metin):** Kalın, italik, altı/üstü çizili, başlık, madde/numaralı liste, alıntı, kod bloğu, bağlantı (Ctrl+K) ve biçimi temizle. Word/e-postadan yapıştırılan metin güvenli biçimde temizlenir (yalnızca bu biçimler korunur). Aynı açıklamayı iki kişi aynı anda düzenlerse kaydederken uyarı çıkar. Açıklaması olan görevlerde kart ve satırda ≡ simgesi görünür.
  - **Resimler:** Ekran görüntüsü veya kopyalanan resim açıklamaya **yapıştırılabilir** (Ctrl+V), editöre **sürüklenebilir** ya da araç çubuğundaki **Resim ekle** düğmesiyle seçilebilir. Resim açıklamanın içinde görünür ve görevle birlikte **Kaydet** ile saklanır (yeni görevde de çalışır). Büyük resimler en uzun kenarı 1920 px olacak şekilde otomatik küçültülür; sıkıştırıldıktan sonra resim başına **en fazla 1 MB**, açıklama başına toplam yaklaşık **3 MB** olabilir (daha büyük dosyalar için Ekler'i kullanın). Resme tıklayınca büyük görünür; buradan **İndir** veya **Açıklamadan kaldır** seçilebilir. Yalnızca kullanıcı girişli ortak veritabanı modunda kullanılabilir. Resimler JSON yedeğine dahildir, Excel'de `[Resim]` olarak görünür.
- **Ekler:** Görev detayında **Dosya ekle** veya sürükle-bırak ile dosya eklenir (dosya başına **en fazla 10 MB**). Tüm kullanıcılar indirebilir; ekleri yalnızca **yükleyen kişi** silebilir. Ek sayısı kart ve satırda 📎 ile gösterilir. Görev silinirse açıklaması ve ekleri de silinir. Ekler kullanıcı girişli ortak veritabanı modunda kullanılabilir.
- **Yorumlar:** Görev detayında Ekler'in altındadır. Yorum en fazla **600 karakter** olabilir (kalan karakter sayacı görünür); **Yorum yap** düğmesi veya **Ctrl+Enter** ile görevi kaydetmeden anında kaydedilir. Yorumlar en yeni üstte listelenir; her yorumun üstünde yazan kişi ve tarih-saat yer alır.
  - **Etiketleme:** `@` yazınca ekip listesi açılır (ad, soyad veya kullanıcı adıyla süzülür; ↑/↓, Enter/Tab ile seçilir, Esc kapatır) ve `@KullaniciAdi` eklenir. Etiketler yorumda vurgulu görünür.
  - **Mail:** Yorumda etiketlenen herkese ve görevin sahibine mail gider (yazan hariç; aynı yorum için kimseye iki kez gitmez). Mailde görev, yorum metni ve yazan yer alır; **Yorumu görüntüle** bağlantısı görevi açar ve yorumu vurgular. Yorum düzenlenirse yalnızca **yeni eklenen** etiketlere mail gider. Mail gönderilemezse atama mailindeki gibi yeniden denenir.
  - **Düzenleme/silme:** Herkes yalnızca **kendi** yorumunu düzenleyip silebilir (silmeden önce onay sorulur); düzenlenen yorumda "düzenlendi" notu görünür.
  - Yorum sayısı kart ve satırda 💬 ile gösterilir. Görev silinirse yorumları da silinir. Kaydedilmemiş yeni görevde yorum yapılamaz; gönderilmemiş bir yorum varken pencere kapatılırsa onay sorulur. Yorumlar Azure'daki günlük yedeğe dahildir; uygulamadaki JSON/Excel yedeğine dahil değildir.
- **Tamamlanan görevler silinmez:** Sayfa açıldığında yalnızca `Durum ≠ Tamamlandı` olan görevler görünür. **Tamamlananları göster** seçeneği (veya Durum filtresinde `Tamamlandı`) ile görülebilir; Board'da bu seçenek yerine "Tamamlandı" sütunundaki **Göster / Gizle** bağlantısı kullanılır. Tamamlanan görevlerin silme butonu kapalıdır; açık görevler onay ile silinebilir.
- **Tarih uyarıları** (yalnızca tamamlanmamış görevler için):
  - 🔴 Kırmızı: Tamamlanma tarihine **3 günden az** kaldı veya tarih **geçti**
  - 🟡 Sarı: Tamamlanma tarihine **1 haftadan az** kaldı
- **Gecikme maili:** Her gün saat **10:00**'da (Türkiye saati) her görev sahibine, tamamlanmamış ve tarihi **geçmiş** görevleri ile **bugün dolan** görevlerini listeleyen tek bir mail gider. Tabloda görev adı (tıklanınca görev detayı açılır), tamamlanma tarihi ve kaç gün geciktiği yer alır; en çok geciken üstte, bugün dolanlar ("Bugün doluyor") en altta. Böyle görevi olmayana mail gitmez. Ayrıntılar: [Gecikme maili](#gecikme-maili).
- **Filtreleme ve sıralama:** Alan/Sahip/Durum filtrelerinde **birden fazla değer** işaretlenebilir (aynı filtrede seçilenlerden herhangi biri, farklı filtreler birlikte uygulanır; hiçbiri seçili değilse "Tümü"). Metin arama ve sütun başlığına tıklayarak sıralama. Board'da sütunlar zaten durumları gösterdiği için Durum filtresi ve gösterilen/açık/tamamlanan sayaçları gizlenir (listede seçilen Durum filtresi board'da uygulanmaz, listeye dönünce korunur); kritik/yaklaşan etiketleri kısaltılmış hâliyle filtrelerin sağında yer alır.
- **Kritik / yaklaşan kısayolu:** Filtrelerin altındaki **kritik** (kırmızı) veya **yaklaşan** (sarı) etiketine tıklayınca yalnızca o gruptaki açık görevler gösterilir; diğer filtrelerle birlikte çalışır. Tekrar tıklamak veya "Filtreleri temizle" filtreyi kaldırır.
- **Timesheet (zaman girişi):** Kullanıcılar bir göreve harcadıkları süreyi girer.
  - **Giriş:** Görev (aranabilir liste – numara, ad veya alan; kendi görevleriniz üstte; açık görevler ve son 30 günde tamamlananlar), **Süre** (saat; `0,5`, `2`, `1,75` gibi – 0,25 saatlik adımlarla, giriş başına ve kişi başına günde en fazla 24 saat), **Tarih** (varsayılan bugün; en fazla 30 gün geriye, gelecek tarih seçilemez) ve **Not** (en fazla 200 karakter).
  - **Girişler sekmesi:** Seçili dönemin girişleri günlere göre gruplu, gün ve dönem toplamlarıyla listelenir. Varsayılan olarak **Benim girişlerim** açıktır; kapatınca tüm ekibin girişleri kişi/alan filtreleriyle görülebilir.
  - **Düzenleme:** Herkes yalnızca **kendi** girişlerini, tarihi son 30 gün içindeyse düzenleyip silebilir.
  - **Rapor sekmesi:** Dönem (Bu ay – varsayılan, Geçen ay, Bu hafta, Son 30 gün, Özel aralık), kişi ve alan filtreleri; toplam süre/giriş/kişi/görev özeti; **kişi**, **alan** ve **görev** bazında toplam saat ve pay çubuğu; **kişi × alan** çapraz tablosu; **gün bazında** tablo (satırlarda dönemin her günü – bugünden sonrası hariç, sütunlarda tüm kullanıcılar; giriş olmayan günler "–", hafta sonları soluk, bugün vurgulu) ve **Excel'e Aktar** (Girişler, Kişi, Alan, Görev, Kişi x Alan, Gün sayfaları). Görev bazında ve Gün bazında bölümleri başlıklarının sağındaki ok ikonuyla daraltılıp genişletilebilir; seçim hatırlanır.
  - **Görev detayı:** Görevin toplam harcanan süresi ve kişi dağılımı gösterilir; **Zaman gir** ile doğrudan o göreve giriş yapılır. Zaman girişi olan görevler silinemez.
- **Yedekleme:** **Yedek Al (JSON)** / **Yedekten Yükle** ve **Excel'e Aktar** (.xlsx – "Görevler" ve "Listeler" sayfaları; No ve düz metin Açıklama sütunlarıyla). JSON yedeği açıklamaları içerir; **ekler yedeğe dahil değildir**.


## Veri saklama

Uygulamanın çalışma modu `config.js` dosyasındaki değerlere göre belirlenir:

| `config.js` | Mod |
|---|---|
| `apiUrl` | ☁ Ortak veritabanı (**Azure**), kullanıcı girişi ile – **şu anki kurulum** |
| `databaseUrl` + `apiKey` | ☁ Ortak veritabanı (Firebase), kullanıcı girişi ile – yalnızca geri dönüş için |
| yalnızca `databaseUrl` | ☁ Firebase, girişsiz (eski kurulumlar) |
| boş | 💻 Yerel mod (yalnızca bu tarayıcı) |

### ☁ Ortak veritabanı modu (Azure, kullanıcı girişi ile)

Veriler ve kullanıcı girişi **Azure** üzerindedir (bkz. [Azure kurulumu](#azure-kurulumu)). Sayfa GitHub Pages'te kalır.

- **Giriş:** Sayfa açıldığında giriş ekranı gelir; her ekip üyesi kendi **e-posta adresi ve şifresi** ile giriş yapar. Oturum, **Çıkış yap** denilene kadar açık kalır. Üst üste 5 hatalı denemede hesap 15 dakika kilitlenir.
  - **Şifremi unuttum:** E-posta adresine **Yeni şifre belirle** bağlantısı gönderilir (1 saat geçerli, tek kullanımlık). Bağlantı uygulamayı açar ve yeni şifre (en az 6 karakter) orada belirlenir; şifre değişince diğer cihazlardaki oturumlar kapanır.
  - **Şifre değiştir:** Sol menünün altındaki profil menüsünden kendi adresinize aynı bağlantı gönderilir.
  - **Çıkış yap:** Oturum ve tarayıcıdaki görev kopyası silinir.
  - **Firebase'den taşınan hesaplar:** Herkes Azure'a ilk girişte **eski şifresiyle** girer; şifre bir kez Firebase'e doğrulatılır ve Azure'a (scrypt özeti olarak) taşınır. Sonraki girişler yalnızca Azure'u kullanır.
- **Erişim:** Yalnızca `/users` listesinde e-postası bulunan kullanıcılar giriş yapabilir ve veriyi görebilir. Listeden çıkarılan biri bir sonraki eşitlemede "erişimi yok" uyarısıyla oturumdan çıkarılır.
- **Sahip listesi = kullanıcılar:** Sahip değerleri `/users` listesinden (sıra alanına göre) otomatik oluşur; Ayarlar'da salt okunurdur. Kullanıcı eklemeden önceki isimler ("Murat E.", "Murat Elmas" gibi) tek bir kullanıcıya açıkça uyuyorsa otomatik olarak kullanıcı adına çevrilir.
- **Oluşturan:** Yeni görevlerde görevi oluşturan kullanıcı kaydedilir ve görev penceresinde "Oluşturan" olarak gösterilir (sonradan değiştirilemez). Liste ve kartlarda gösterilmez.
- **Benim görevlerim:** Araç çubuğundaki kişi ikonlu düğme, Sahip filtresini giriş yapan kullanıcıya ayarlar; tekrar tıklayınca kaldırır.
- **Atama maili:** Bir görev bir ekip üyesine atandığında (sahibi olarak yeni görev oluşturulduğunda veya Sahip değiştirildiğinde) o kişiye mail gider. Mailde görev no, başlık, Alan, Öncelik, Durum, Tamamlanma Tarihi, atayan kişi ve görevi doğrudan açan **Görevi aç** bağlantısı (`?gorev=No`) bulunur. Kişi kendini atarsa veya görev Sahip değişmeden kaydedilirse mail gitmez. Çevrimdışıyken yapılan atamalar bağlantı gelince bildirilir.
- Her değişiklik **otomatik olarak** kaydedilir; tüm ekip aynı listeyi görür. Başkalarının değişiklikleri 30 saniyede bir ve sayfaya dönüldüğünde çekilir.
- Bağlantı koparsa değişiklikler tarayıcıda bekletilir ("Çevrimdışı") ve bağlantı gelince gönderilir. Sol menünün altında eşitleme durumu görünür.
- **Sunucu kuralları** (`api/src/lib/rules.js`, `database.rules.json` ile aynı) şunları engeller: tüm verinin tek seferde silinmesi, **Tamamlandı** görevlerin silinmesi, listelerin silinmesi, "Oluşturan" bilgisinin veya görev numarasının değiştirilmesi, aynı numaranın iki göreve verilmesi, başkasının yüklediği ekin silinmesi, başkası adına zaman girişi yapılması, başkasının veya 30 günden eski girişlerin değiştirilmesi, 0,25 adımına uymayan ya da 24 saati aşan süreler ve hatalı biçimli kayıtlar. Birden çok yolu değiştiren istekler bütün olarak uygulanır ya da hiç uygulanmaz.

> Zaman girişlerinde `gorevNo`, `gorevAdi` ve `alan` görevin o anki kopyasıdır; görev sonradan değişse de rapor okunabilir kalır. Günlük 24 saat toplam sınırı uygulama tarafından denetlenir.

Veri yapısı (Firebase'deki ile aynı):

| Yol | İçerik |
|---|---|
| `/tasks/{id}` | `id, gorev, alan, sahip, durum, oncelik, tamamlanmaTarihi (YYYY-MM-DD), completedAt, createdAt, updatedAt, createdBy, no, aciklamaVar, ekSayisi` |
| `/lists/{alan\|sahip\|durum}` | Değerler, her satırda bir değer olacak şekilde metin |
| `/users/{e-posta anahtarı}` | `ad, soyad, kullaniciAdi, email, sira` – `api/tools/users.js` ile düzenlenir |
| `/taskNumbers/{no}` | Numarayı alan görevin anahtarı. Yalnızca bir kez yazılabilir; numaraların benzersiz olmasını sağlar. |
| `/details/{id}` | `aciklama` (temizlenmiş HTML; resimler `data:image/…;base64` olarak gömülü – toplam en fazla 3.000.000, resimler hariç metin en fazla 100.000 karakter), `updatedAt`, `updatedBy` – yalnızca detay açılınca okunur |
| `/attachments/{id}/{dosyaId}` | `ad, boyut, tur, yukleyen, yuklenmeTarihi, parca` |
| `/files/{id}/{dosyaId}` | `yukleyen`, `p` – dosyanın 384 KB'lık parçaları (base64; Azure'da her parça ayrı blob) |
| `/timesheets/{girişId}` | `gorevId, kullanici, tarih (YYYY-MM-DD), gun, saat, not, gorevNo, gorevAdi, alan, createdAt, updatedAt` – yalnızca seçili dönem veya görev için sorgulanır |
| `/assignmentMails/{id}` | `sahip, at` – görev için en son atama maili gönderilen kişi (aynı atamaya ikinci mail gitmemesi için) |

> `oncelik` alanı yalnızca **Orta** dışındaki değerler için yazılır (`Yüksek`, `Düşük` veya boş = belirtilmemiş); alan yoksa öncelik **Orta** kabul edilir. `createdBy` giriş özelliğinden önce oluşturulan görevlerde yoktur.

> `/users` anahtarı küçük harfe çevrilmiş e-postadır ve içindeki noktalar `%2E` olarak yazılır (ör. `murate@logosoft%2Ecom%2Etr`).

> Bu tarayıcıda daha önce yerel olarak girilmiş görevler varsa, ilk açılışta "ortak listeye aktarılsın mı?" diye sorulur.

### 💻 Yerel mod

`config.js` boşsa veriler yalnızca kullandığınız tarayıcının `localStorage` alanında saklanır (sunucuya gönderilmez, giriş yoktur). Farklı tarayıcıda görünmez ve tarayıcı verileri temizlenirse kaybolur; bu modda **Yedek Al (JSON)** ile düzenli yedek alın.

## Azure kurulumu

Tüm sunucu tarafı `api/` klasöründeki **Azure Functions** uygulamasıdır (Node.js). GitHub Pages yalnızca statik dosya sunar ve depo herkese açıktır; bu yüzden şifreler, anahtarlar ve kurallar sunucudadır.

```
GitHub Pages (index.html, app.js …)
   │  HTTPS, Authorization: Bearer <oturum token'ı>
   ▼
Azure Function App  task-manager-notify-wf3n2h
   ├─ /api/db/<yol>.json      Firebase REST ile uyumlu veri API'si (GET/PUT/PATCH/DELETE, sorgular) + kurallar
   ├─ /api/auth/*             giriş, oturum yenileme, şifre belirleme
   ├─ /api/assignment-notify  atama maili
   ├─ /api/comment-notify     yorum maili (etiketlenenler + görev sahibi)
   ├─ overdueDigest           her gün 10:00 (TR) gecikme maili
   └─ dailyBackup             her gece 01:30 (UTC) yedek
   ▼
Depolama hesabı  taskmgrdatawf3n2h
   ├─ data/db.json            tüm veriler (ekler hariç) – eşzamanlı yazmalar ETag ile korunur
   ├─ data/auth.json          şifre özetleri (scrypt), oturum sürümleri, şifre belirleme bağlantıları
   ├─ data/jobs.json          gecikme maili kayıtları (kime hangi gün gönderildi)
   ├─ data/files/<görev>/<dosya>/<parça>   ek parçaları
   └─ backups/                günlük db/auth kopyaları (30 gün saklanır)
```

| Kaynak (`rg-MURAT`, abonelik 14K Azure Subscription 2026 -LG, West Europe) | |
|---|---|
| Function App | `task-manager-notify-wf3n2h` (Flex Consumption, Node 24) – uç nokta `https://task-manager-notify-wf3n2h.azurewebsites.net/api` |
| Veri depolama | `taskmgrdatawf3n2h` – silinen blob'lar ve kapsayıcılar **30 gün** geri alınabilir, sürüm geçmişi açık (eski sürümler 30 gün sonra silinir) |
| Çalışma zamanı depolama | `taskmgrnotifywf3n2h` (Functions'ın kendi depolaması) |

CORS yalnızca `https://muratelmastr.github.io` adresine izin verir. Maliyet bu hacimde fiilen sıfırdır (Functions ücretsiz kotası + birkaç MB depolama).

### Function App ayarları (Ortam değişkenleri)

| Ayar | Değer |
|---|---|
| `DATA_CONNECTION` | Veri depolama hesabının bağlantı dizesi. **Depoya yazılmaz.** |
| `JWT_SECRET` | Oturum token'larını imzalayan rastgele anahtar (değiştirilirse herkes yeniden giriş yapar). **Depoya yazılmaz.** |
| `APP_URL` | `https://muratelmastr.github.io/task-manager/` (mail bağlantıları) |
| `FIREBASE_API_KEY` | Geçiş dönemi: henüz Azure'a giriş yapmamış hesapların eski şifresini Firebase'e doğrulatmak için |
| `FIREBASE_DB_URL` | Geçiş dönemi: eski (Firebase) sürümü açık kalan tarayıcıların atama maili isteği için |
| `SMTP_USER` / `SMTP_PASS` | Mail gönderimi: Gmail adresi ve **uygulama şifresi**. **Şifre depoya yazılmaz.** |
| `SMTP_HOST` / `SMTP_PORT` | *(isteğe bağlı)* Varsayılan `smtp.gmail.com` / `465` |
| `ACS_CONNECTION_STRING` | *(isteğe bağlı)* Azure Communication Services; doluysa SMTP yerine kullanılır (`api/setup-acs.ps1`) |
| `RESEND_API_KEY` | *(isteğe bağlı)* ACS ve SMTP yoksa Resend kullanılır |
| `MAIL_FROM` | Gönderen, ör. `Ekip Görev Takibi <mrtlms@gmail.com>` (SMTP hesabıyla aynı adres olmalı) |
| `MAIL_REDIRECT_TO` | *(isteğe bağlı)* Doluysa tüm mailler bu adrese gider ve konuda asıl alıcı yazar (test modu) |

Bir ayarı değiştirmek (ör. Gmail uygulama şifresi):

```powershell
az functionapp config appsettings set -g rg-MURAT -n task-manager-notify-wf3n2h --settings SMTP_PASS=<yeni uygulama şifresi>
```

### Ekip üyeleri

Araçlar yerel bilgisayarda, `api` klasöründe çalıştırılır (`npm install` sonrası). Bağlantı dizesi:

```powershell
$env:DATA_CONNECTION = az storage account show-connection-string -g rg-MURAT -n taskmgrdatawf3n2h --query connectionString -o tsv
node tools/users.js list
node tools/users.js add --email ayse@logosoft.com.tr --ad Ayşe --soyad Yılmaz --kullanici Ayse
node tools/users.js remove --email ayse@logosoft.com.tr
```

Yeni üye giriş ekranındaki **Şifremi unuttum** ile şifresini belirler (veya `NEW_PASSWORD` ortam değişkeniyle `node tools/users.js set-password --email …`). Listeden çıkarılan üyenin görevleri ve zaman girişleri korunur.

### Yedekleme ve geri yükleme

- **Otomatik:** Her gece `backups/db-YYYY-MM-DD.json` ve `auth-…json` alınır (30 gün). Ayrıca `db.json`'un her değişikliği 30 gün boyunca sürüm olarak saklanır; ekler silinse de 30 gün geri alınabilir (Azure portalı → depolama hesabı → **Kapsayıcılar → data** → blob → **Sürümler / Silinenleri göster**).
- **Tam dışa aktarım** (ekler dahil, Firebase ile uyumlu tek JSON): `node tools/export-azure.js --out yedek.json`
- **Bir yedeğe dönmek:** `db.json`'un istenen sürümünü portalda **Geçerli sürüm yap** ile geri alın veya `backups/` altındaki kopyayı `data/db.json` üzerine kopyalayın.

### Firebase'den aktarım (yapıldığı gibi)

1. Firebase konsolu → **Realtime Database → ⋮ → JSON'u dışa aktar**.
2. `node tools/import-firebase.js --export <dosya>.json` – tüm veriyi (ekler dahil) aktarır, ardından Azure'dan geri okuyup her koleksiyonun sayısını ve içerik özetini karşılaştırır (`SONUÇ: TAMAM`). Azure'da veri varsa durur.
3. Uygulama `config.js` → `apiUrl` ile Azure'a geçer; herkes bir kez yeniden giriş yapar (eski şifreyle).
4. Geçiş sırasında Firebase'de yapılan değişiklikler için yeniden dışa aktarıp `--mode merge` ile aktarın (eksik ve daha yeni kayıtları alır, hiçbir şeyi silmez).
5. Firebase 30 gün yedek olarak kalır: **Kurallar** sekmesine `database.rules.readonly.json` yapıştırılıp yayınlanınca salt okunur olur.

### Fonksiyonu güncellemek

```powershell
cd api
npm install --omit=dev
tar -a -c -f ..\api.zip host.json package.json src node_modules
az functionapp deployment source config-zip -g rg-MURAT -n task-manager-notify-wf3n2h --src ..\api.zip
```

### Geri dönüş (Firebase'e)

`config.js` dosyasını eski değerlerle değiştirin ve Firebase kurallarını tekrar `database.rules.json` yapın:

```js
window.TASK_MANAGER_CONFIG = {
  databaseUrl: 'https://task-manager-b3cea-default-rtdb.europe-west1.firebasedatabase.app',
  apiKey: 'AIzaSyBGMMyR2RQOhtW2KxZvnDTmoeBXx5_yqMY',
  notifyUrl: 'https://task-manager-notify-wf3n2h.azurewebsites.net/api/assignment-notify',
};
```

Azure'da geçişten sonra yapılan değişiklikleri taşımak için `node tools/export-azure.js` çıktısını Firebase konsolunda **JSON'u içe aktar** ile yükleyin.

### Mail servisleri

Mail üç servisten biriyle gönderilir: `ACS_CONNECTION_STRING` varsa **Azure Communication Services**, yoksa `SMTP_USER`/`SMTP_PASS` varsa **SMTP (Gmail – şu an)**, ikisi de yoksa **Resend**.

| | Gmail SMTP (şu an) | Azure Communication Services | Resend |
|---|---|---|---|
| Domain | Gerekmez – `mrtlms@gmail.com` adresinden gider | Gerekmez – Azure'un ücretsiz domaini (`DoNotReply@….azurecomm.net`) | Doğrulanmış domain gerekir |
| Sınır | Günde 500 mail | Dakikada 5, saatte 10 mail | Günde 100 mail |
| Önkoşul | Gmail'de 2 adımlı doğrulama + uygulama şifresi | Abonelikte `Microsoft.Communication` kaydı (abonelik yöneticisi), sonra `api/setup-acs.ps1` | DNS ile domain doğrulama |

Mail servisi geçici olarak reddederse (ör. saatlik sınır) uygulama atama ve yorum maillerini 1, 5, 10 ve 15'er dakika arayla (toplam yaklaşık 1,5 saat) yeniden dener. Yorum maillerinde kime gönderildiği `commentMails` altında tutulur; yeniden denemede yalnızca henüz mail almamış kişilere gönderilir.

### Gecikme maili

`overdueDigest` zamanlayıcısı **hafta içi (Pazartesi–Cuma) 07:00 UTC = 10:00 Türkiye saati** çalışır; Cumartesi ve Pazar mail gitmez. Hafta sonu dolan görevler Pazartesi maili ile gecikmiş olarak gelir.

- **Seçim:** Durumu `Tamamlandı` olmayan, Sahibi bir kullanıcı hesabına karşılık gelen ve tamamlanma tarihi **dün veya daha önce** (gecikmiş) ya da **bugün** olan görevler. Tarihi boş, sahibi boş veya listede olmayan görevler dahil edilmez. "Bugün" İstanbul saatine göre hesaplanır.
- **Mail:** Kişi başına tek mail; konu `Geciken görevleriniz: N görev · M görev bugün doluyor` (yalnızca bugün dolan varsa `Bugün dolan görevleriniz: M görev`). Görev bağlantıları `APP_URL?gorev=<No>` ile görevi açar.
- **Tekrar gönderim yok:** Gönderilen kişi `data/jobs.json`'a o günün tarihiyle yazılır; aynı gün ikinci çalıştırma (ör. yeniden deneme) aynı kişiye tekrar göndermez. Gönderimi başarısız olan kişi kaydedilmez, bir sonraki çalıştırmada yeniden denenir. `MAIL_REDIRECT_TO` doluysa tüm gecikme mailleri de o adrese gider.
- **Elle çalıştırma / önizleme** (`api` klasöründe, `DATA_CONNECTION` ayarlıyken). Elle gönderim günün kaydını değiştirmez; saat 10:00 gönderimi yine yapılır. Elle çalıştırma hafta sonu da çalışır.

```powershell
node tools/overdue.js --dry-run                        # bugün kime hangi görevler gidecek (göndermez)
$env:SMTP_USER='…'; $env:SMTP_PASS='…'; $env:MAIL_FROM='…'
node tools/overdue.js --to kisi@logosoft.com.tr        # yalnızca bu kişinin mailini şimdi gönderir
$env:MAIL_REDIRECT_TO='murate@logosoft.com.tr'         # (ek olarak) maili kişi yerine bu adrese gönderir – önizleme
```

## Yerel kullanım

Depoyu indirip `index.html` dosyasını tarayıcıda açmanız yeterlidir. Excel'e aktarma için internet bağlantısı gerekir (SheetJS kütüphanesi CDN'den yüklenir).

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | Sayfa yapısı |
| `styles.css` | Görünüm |
| `app.js` | Uygulama mantığı (veri, tablo, filtreler, ayarlar, içe/dışa aktarma, bulut eşitleme, giriş akışı) |
| `auth.js` | Giriş istemcisi (e-posta/şifre girişi, şifre belirleme, oturum yenileme): Azure API veya Firebase Authentication |
| `cloud.js` | Veri istemcisi (Firebase REST biçimi; Azure API veya Firebase Realtime Database) |
| `timesheet.js` | Timesheet: zaman girişleri, giriş penceresi ve raporlar |
| `report.js` | Görevler → Rapor: dönemlik kişi/alan bazında çalışılan, kapatılan ve devam eden görev özeti |
| `config.js` | Sunucu adresi (`apiUrl`); Firebase'e geri dönüş için `databaseUrl`/`apiKey`/`notifyUrl` |
| `api/` | Azure Functions sunucusu: veri API'si ve kuralları (`src/lib/rules.js`), giriş, atama maili, günlük yedek; `tools/` altında aktarım, dışa aktarım ve kullanıcı araçları; ACS kurulum betiği `setup-acs.ps1` |
| `database.rules.json` | Firebase kuralları (geri dönüş için; sunucu kurallarıyla aynı) |
| `database.rules.readonly.json` | Geçişten sonra Firebase'i salt okunur yapan kurallar |