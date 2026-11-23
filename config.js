// Ortak veritabanı ayarı (Firebase Realtime Database + Authentication). Değerler gizli değildir;
// verileri giriş zorunluluğu ve database.rules.json korur.
// databaseUrl boş bırakılırsa veriler yalnızca bu tarayıcıda (localStorage) saklanır.
// apiKey boş bırakılırsa kullanıcı girişi kapalıdır.
window.TASK_MANAGER_CONFIG = {
  databaseUrl: 'https://task-manager-b3cea-default-rtdb.europe-west1.firebasedatabase.app',
  apiKey: 'AIzaSyBGMMyR2RQOhtW2KxZvnDTmoeBXx5_yqMY',
};
