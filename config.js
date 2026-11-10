// Bulut (SharePoint) ayarları. Değerler gizli değildir.
// clientId / tenantId / siteUrl boş bırakılırsa veriler yalnızca bu tarayıcıda (localStorage) saklanır.
window.TASK_MANAGER_CONFIG = {
  clientId: '', // Entra ID uygulama kaydı → Application (client) ID
  tenantId: '', // Entra ID → Directory (tenant) ID
  siteUrl: '', // Örn. https://sirket.sharepoint.com/sites/EkipSitesi
  taskListName: 'Gorevler',
  settingsListName: 'GorevAyarlari',
  scopes: ['Sites.Manage.All'], // Listeleri otomatik oluşturmak için. Listeler elle oluşturulduysa 'Sites.ReadWrite.All' yeterli.
};
