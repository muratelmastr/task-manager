// Bulut (SharePoint) ayarları. Değerler gizli değildir.
// clientId / tenantId / siteUrl boş bırakılırsa veriler yalnızca bu tarayıcıda (localStorage) saklanır.
window.TASK_MANAGER_CONFIG = {
  clientId: 'ca50bb50-0587-485b-bed5-e40bf32ece27', // Entra ID uygulama kaydı → Application (client) ID
  tenantId: '9186c5a5-e521-45d0-8ef8-ad79cfac65e6', // Entra ID → Directory (tenant) ID
  siteUrl: '', // Örn. https://sirket.sharepoint.com/sites/EkipSitesi
  taskListName: 'Gorevler',
  settingsListName: 'GorevAyarlari',
  scopes: ['Sites.Manage.All'], // Listeleri otomatik oluşturmak için. Listeler elle oluşturulduysa 'Sites.ReadWrite.All' yeterli.
};
