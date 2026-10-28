// Native translations authored for this app. No upstream translation assets are bundled.
import { nativeCatalogs } from './nativeCatalog';
import { resourceCatalogs } from './resources/generated';
export const availableLanguages = [
  { key: 'en', label: 'English' }, { key: 'de', label: 'Deutsch' },
  { key: 'es', label: 'Español' }, { key: 'fr', label: 'Français' },
  { key: 'ja', label: '日本語' }, { key: 'it', label: 'Italiano' },
  { key: 'ko', label: '한국어' }, { key: 'nl', label: 'Nederlands' },
  { key: 'pt-BR', label: 'Português (Brasil)' },
  { key: 'zh-CN', label: '简体中文' }, { key: 'zh-TW', label: '繁體中文' },
  { key: 'sv', label: 'Svenska' }, { key: 'tr', label: 'Türkçe' },
  { key: 'ru', label: 'Русский' }, { key: 'uk', label: 'Українська' },
] as const;
export type Language = typeof availableLanguages[number]['key'];

export const english: Record<string, string> = {
  'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
  'common.close': 'Close', 'common.edit': 'Edit', 'common.add': 'Add',
  'common.search': 'Search', 'common.filters': 'Filters', 'common.retry': 'Retry',
  'common.loading': 'Loading...', 'common.error': 'Something went wrong',
  'common.confirm': 'Confirm', 'common.reset': 'Reset', 'common.none': 'None',
  'common.refresh': 'Refresh', 'common.back': 'Back',
  'common.required': 'This field is required', 'common.saved': 'Settings saved',
  'nav.dashboard': 'Dashboard', 'nav.queue': 'Queue', 'nav.archives': 'Archives',
  'nav.files': 'Files', 'nav.more': 'More', 'nav.settings': 'Settings',
  'nav.inventory': 'Inventory', 'nav.projects': 'Projects', 'nav.printers': 'Printers',
  'nav.notifications': 'Notifications', 'nav.stats': 'Stats', 'nav.energy': 'Energy',
  'announcements.title': 'Announcements', 'announcements.earlier': 'Earlier',
  'announcements.empty': 'No announcements', 'announcements.readMore': 'Read more',
  'announcements.gotIt': 'Got it', 'announcements.unread': 'Unread',
  'announcements.info': 'Information', 'announcements.important': 'Important',
  'announcements.critical': 'Critical', 'announcements.hidden': 'Announcements are not available for this account.',
  'preferences.title': 'UI preferences', 'preferences.landing': 'Default landing page',
  'preferences.printer': 'Default printer', 'preferences.noPrinter': 'No default printer',
  'preferences.removedPrinter': 'Removed printer ({{id}})',
  'preferences.reset': 'Reset UI preferences',
  'preferences.resetMessage': 'Reset local language, appearance, landing page, and archive filters? Server settings, account credentials, and server connection will not be changed.',
  'preferences.background': 'Background', 'preferences.accent': 'Accent',
  'preferences.style': 'Style', 'preferences.dark': 'Dark', 'preferences.light': 'Light',
  'preferences.system': 'System', 'preferences.language': 'Language',
  'preferences.notificationLanguage': 'Notification language',
  'preferences.announcementsEnabled': 'Enable announcements',
  'preferences.announcementsAllUsers': 'Show announcements to all users',
};

const keys = [
  'common.save', 'common.cancel', 'common.delete', 'common.close', 'common.edit',
  'common.add', 'common.search', 'common.filters', 'common.retry', 'common.loading',
  'common.error', 'common.confirm', 'common.reset', 'common.none', 'common.refresh',
  'common.back', 'common.required', 'common.saved',
  'nav.dashboard', 'nav.queue', 'nav.archives', 'nav.files', 'nav.more', 'nav.settings',
  'nav.inventory', 'nav.projects', 'nav.printers', 'nav.notifications', 'nav.stats', 'nav.energy',
  'announcements.title', 'announcements.earlier', 'announcements.empty',
  'announcements.readMore', 'announcements.gotIt', 'announcements.unread',
  'announcements.info', 'announcements.important', 'announcements.critical',
] as const;
const rows: Record<Exclude<Language, 'en'>, string[]> = {
  de: ['Speichern','Abbrechen','Löschen','Schließen','Bearbeiten','Hinzufügen','Suchen','Filter','Erneut versuchen','Wird geladen...','Etwas ist schiefgelaufen','Bestätigen','Zurücksetzen','Keine','Aktualisieren','Zurück','Dieses Feld ist erforderlich','Einstellungen gespeichert','Übersicht','Warteschlange','Archive','Dateien','Mehr','Einstellungen','Bestand','Projekte','Drucker','Benachrichtigungen','Statistik','Energie','Ankündigungen','Frühere','Keine Ankündigungen','Mehr lesen','Verstanden','Ungelesen','Information','Wichtig','Kritisch'],
  es: ['Guardar','Cancelar','Eliminar','Cerrar','Editar','Añadir','Buscar','Filtros','Reintentar','Cargando...','Algo salió mal','Confirmar','Restablecer','Ninguno','Actualizar','Atrás','Este campo es obligatorio','Ajustes guardados','Panel','Cola','Archivos de impresión','Archivos','Más','Ajustes','Inventario','Proyectos','Impresoras','Notificaciones','Estadísticas','Energía','Anuncios','Anteriores','No hay anuncios','Leer más','Entendido','Sin leer','Información','Importante','Crítico'],
  fr: ['Enregistrer','Annuler','Supprimer','Fermer','Modifier','Ajouter','Rechercher','Filtres','Réessayer','Chargement...','Une erreur est survenue','Confirmer','Réinitialiser','Aucun','Actualiser','Retour','Ce champ est obligatoire','Paramètres enregistrés','Tableau de bord','File d’attente','Archives','Fichiers','Plus','Paramètres','Inventaire','Projets','Imprimantes','Notifications','Statistiques','Énergie','Annonces','Précédentes','Aucune annonce','En savoir plus','Compris','Non lu','Information','Important','Critique'],
  ja: ['保存','キャンセル','削除','閉じる','編集','追加','検索','フィルター','再試行','読み込み中...','エラーが発生しました','確認','リセット','なし','更新','戻る','必須項目です','設定を保存しました','ダッシュボード','キュー','アーカイブ','ファイル','その他','設定','在庫','プロジェクト','プリンター','通知','統計','電力','お知らせ','過去のお知らせ','お知らせはありません','詳細を読む','了解','未読','情報','重要','緊急'],
  it: ['Salva','Annulla','Elimina','Chiudi','Modifica','Aggiungi','Cerca','Filtri','Riprova','Caricamento...','Si è verificato un errore','Conferma','Ripristina','Nessuno','Aggiorna','Indietro','Questo campo è obbligatorio','Impostazioni salvate','Pannello','Coda','Archivi','File','Altro','Impostazioni','Inventario','Progetti','Stampanti','Notifiche','Statistiche','Energia','Annunci','Precedenti','Nessun annuncio','Leggi di più','Capito','Non letto','Informazione','Importante','Critico'],
  ko: ['저장','취소','삭제','닫기','편집','추가','검색','필터','다시 시도','불러오는 중...','오류가 발생했습니다','확인','초기화','없음','새로 고침','뒤로','필수 입력 항목입니다','설정이 저장되었습니다','대시보드','대기열','보관함','파일','더 보기','설정','재고','프로젝트','프린터','알림','통계','전력','공지 사항','이전 공지','공지 사항 없음','자세히 보기','확인했어요','읽지 않음','정보','중요','긴급'],
  nl: ['Opslaan','Annuleren','Verwijderen','Sluiten','Bewerken','Toevoegen','Zoeken','Filters','Opnieuw proberen','Laden...','Er is iets misgegaan','Bevestigen','Herstellen','Geen','Vernieuwen','Terug','Dit veld is verplicht','Instellingen opgeslagen','Overzicht','Wachtrij','Archieven','Bestanden','Meer','Instellingen','Voorraad','Projecten','Printers','Meldingen','Statistieken','Energie','Aankondigingen','Eerder','Geen aankondigingen','Meer lezen','Begrepen','Ongelezen','Informatie','Belangrijk','Kritiek'],
  'pt-BR': ['Salvar','Cancelar','Excluir','Fechar','Editar','Adicionar','Pesquisar','Filtros','Tentar novamente','Carregando...','Ocorreu um erro','Confirmar','Redefinir','Nenhum','Atualizar','Voltar','Este campo é obrigatório','Configurações salvas','Painel','Fila','Arquivos de impressão','Arquivos','Mais','Configurações','Estoque','Projetos','Impressoras','Notificações','Estatísticas','Energia','Anúncios','Anteriores','Nenhum anúncio','Leia mais','Entendi','Não lido','Informação','Importante','Crítico'],
  'zh-CN': ['保存','取消','删除','关闭','编辑','添加','搜索','筛选','重试','加载中...','发生错误','确认','重置','无','刷新','返回','此项为必填项','设置已保存','仪表盘','队列','归档','文件','更多','设置','库存','项目','打印机','通知','统计','能源','公告','以前的公告','暂无公告','阅读更多','知道了','未读','信息','重要','紧急'],
  'zh-TW': ['儲存','取消','刪除','關閉','編輯','新增','搜尋','篩選','重試','載入中...','發生錯誤','確認','重設','無','重新整理','返回','此欄位為必填','設定已儲存','儀表板','佇列','封存','檔案','更多','設定','庫存','專案','印表機','通知','統計','能源','公告','先前的公告','暫無公告','閱讀更多','知道了','未讀','資訊','重要','緊急'],
  sv: ['Spara','Avbryt','Ta bort','Stäng','Redigera','Lägg till','Sök','Filter','Försök igen','Läser in...','Något gick fel','Bekräfta','Återställ','Ingen','Uppdatera','Tillbaka','Fältet är obligatoriskt','Inställningar sparade','Översikt','Kö','Arkiv','Filer','Mer','Inställningar','Lager','Projekt','Skrivare','Aviseringar','Statistik','Energi','Meddelanden','Tidigare','Inga meddelanden','Läs mer','Förstått','Oläst','Information','Viktigt','Kritiskt'],
  tr: ['Kaydet','İptal','Sil','Kapat','Düzenle','Ekle','Ara','Filtreler','Tekrar dene','Yükleniyor...','Bir hata oluştu','Onayla','Sıfırla','Yok','Yenile','Geri','Bu alan zorunludur','Ayarlar kaydedildi','Gösterge paneli','Kuyruk','Arşivler','Dosyalar','Diğer','Ayarlar','Envanter','Projeler','Yazıcılar','Bildirimler','İstatistikler','Enerji','Duyurular','Öncekiler','Duyuru yok','Devamını oku','Anladım','Okunmamış','Bilgi','Önemli','Kritik'],
  ru: ['Сохранить','Отмена','Удалить','Закрыть','Изменить','Добавить','Поиск','Фильтры','Повторить','Загрузка...','Произошла ошибка','Подтвердить','Сбросить','Нет','Обновить','Назад','Обязательное поле','Настройки сохранены','Обзор','Очередь','Архивы','Файлы','Ещё','Настройки','Запасы','Проекты','Принтеры','Уведомления','Статистика','Энергия','Объявления','Предыдущие','Нет объявлений','Подробнее','Понятно','Не прочитано','Информация','Важно','Критично'],
  uk: ['Зберегти','Скасувати','Видалити','Закрити','Редагувати','Додати','Пошук','Фільтри','Повторити','Завантаження...','Сталася помилка','Підтвердити','Скинути','Немає','Оновити','Назад','Обов’язкове поле','Налаштування збережено','Огляд','Черга','Архіви','Файли','Більше','Налаштування','Запаси','Проєкти','Принтери','Сповіщення','Статистика','Енергія','Оголошення','Попередні','Немає оголошень','Докладніше','Зрозуміло','Не прочитано','Інформація','Важливо','Критично'],
};

export const catalogs: Record<Language, Record<string, string>> = { en: english } as Record<Language, Record<string, string>>;
for (const language of Object.keys(rows) as Exclude<Language, 'en'>[]) {
  catalogs[language] = Object.fromEntries(keys.map((key, index) => [key, rows[language][index]]));
}
for (const language of Object.keys(catalogs) as Language[]) {
  Object.assign(catalogs[language], nativeCatalogs[language]);
}
export const resourceEnglish = resourceCatalogs.en ?? {};
catalogs.en = { ...english, ...resourceEnglish };
for (const language of Object.keys(catalogs) as Language[]) {
  if (language !== 'en') Object.assign(catalogs[language], resourceCatalogs[language]);
}
