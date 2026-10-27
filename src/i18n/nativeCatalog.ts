import type { Language } from './catalog';

const labels = {
  'preferences.title': 'UI preferences',
  'preferences.landing': 'Default landing page',
  'preferences.printer': 'Default printer',
  'preferences.noPrinter': 'No default printer',
  'preferences.reset': 'Reset UI preferences',
  'preferences.background': 'Background',
  'preferences.accent': 'Accent',
  'preferences.style': 'Style',
  'preferences.dark': 'Dark',
  'preferences.light': 'Light',
  'preferences.system': 'System',
  'preferences.language': 'Language',
  'preferences.notificationLanguage': 'Notification language',
  'preferences.announcementsEnabled': 'Enable announcements',
  'preferences.announcementsAllUsers': 'Show announcements to all users',
  'preferences.background.neutral': 'Neutral',
  'preferences.background.warm': 'Warm',
  'preferences.background.cool': 'Cool',
  'preferences.background.oled': 'OLED',
  'preferences.background.slate': 'Slate',
  'preferences.background.forest': 'Forest',
  'preferences.accent.green': 'Green',
  'preferences.accent.teal': 'Teal',
  'preferences.accent.blue': 'Blue',
  'preferences.accent.orange': 'Orange',
  'preferences.accent.purple': 'Purple',
  'preferences.accent.red': 'Red',
  'preferences.style.classic': 'Classic',
  'preferences.style.glow': 'Glow',
  'preferences.style.vibrant': 'Vibrant',
  'common.offline': 'No network',
  'common.name': 'Name',
  'common.status': 'Status',
  'common.enabled': 'Enabled',
  'common.disabled': 'Disabled',
  'common.start': 'Start',
  'common.stop': 'Stop',
  'common.print': 'Print',
  'common.download': 'Download',
  'common.upload': 'Upload',
  'common.date': 'Date',
  'common.time': 'Time',
  'common.cost': 'Cost',
  'common.weight': 'Weight',
  'common.total': 'Total',
  'common.all': 'All',
  'common.yes': 'Yes',
  'common.no': 'No',
};
// Each row follows labels' insertion order. Tests enforce complete, nonempty rows.
const rows: Record<Exclude<Language, 'en'>, string> = {
  de: 'Oberflächeneinstellungen|Startseite|Standarddrucker|Kein Standarddrucker|Oberflächeneinstellungen zurücksetzen|Hintergrund|Akzent|Stil|Dunkel|Hell|System|Sprache|Benachrichtigungssprache|Ankündigungen aktivieren|Ankündigungen allen Benutzern zeigen|Neutral|Warm|Kühl|OLED|Schiefer|Wald|Grün|Türkis|Blau|Orange|Lila|Rot|Klassisch|Leuchtend|Kräftig|Kein Netzwerk|Name|Status|Aktiviert|Deaktiviert|Starten|Stoppen|Drucken|Herunterladen|Hochladen|Datum|Uhrzeit|Kosten|Gewicht|Gesamt|Alle|Ja|Nein',
  es: 'Preferencias de interfaz|Página inicial|Impresora predeterminada|Sin impresora predeterminada|Restablecer preferencias de interfaz|Fondo|Acento|Estilo|Oscuro|Claro|Sistema|Idioma|Idioma de notificaciones|Activar anuncios|Mostrar anuncios a todos los usuarios|Neutro|Cálido|Frío|OLED|Pizarra|Bosque|Verde|Verde azulado|Azul|Naranja|Morado|Rojo|Clásico|Resplandor|Vibrante|Sin conexión|Nombre|Estado|Activado|Desactivado|Iniciar|Detener|Imprimir|Descargar|Subir|Fecha|Hora|Coste|Peso|Total|Todos|Sí|No',
  fr: 'Préférences d’interface|Page d’accueil|Imprimante par défaut|Aucune imprimante par défaut|Réinitialiser les préférences d’interface|Arrière-plan|Accent|Style|Sombre|Clair|Système|Langue|Langue des notifications|Activer les annonces|Afficher les annonces à tous les utilisateurs|Neutre|Chaud|Froid|OLED|Ardoise|Forêt|Vert|Turquoise|Bleu|Orange|Violet|Rouge|Classique|Lumineux|Vif|Pas de réseau|Nom|État|Activé|Désactivé|Démarrer|Arrêter|Imprimer|Télécharger|Importer|Date|Heure|Coût|Poids|Total|Tous|Oui|Non',
  ja: '画面設定|起動時のページ|既定のプリンター|既定のプリンターなし|画面設定をリセット|背景|アクセント|スタイル|ダーク|ライト|システム|言語|通知の言語|お知らせを有効にする|すべてのユーザーにお知らせを表示|ニュートラル|暖色|寒色|OLED|スレート|フォレスト|緑|青緑|青|オレンジ|紫|赤|クラシック|グロー|鮮やか|ネットワークなし|名前|状態|有効|無効|開始|停止|印刷|ダウンロード|アップロード|日付|時刻|費用|重量|合計|すべて|はい|いいえ',
  it: 'Preferenze dell’interfaccia|Pagina iniziale|Stampante predefinita|Nessuna stampante predefinita|Ripristina preferenze dell’interfaccia|Sfondo|Accento|Stile|Scuro|Chiaro|Sistema|Lingua|Lingua delle notifiche|Abilita annunci|Mostra annunci a tutti gli utenti|Neutro|Caldo|Freddo|OLED|Ardesia|Foresta|Verde|Verde acqua|Blu|Arancione|Viola|Rosso|Classico|Luminoso|Vivace|Rete assente|Nome|Stato|Abilitato|Disabilitato|Avvia|Ferma|Stampa|Scarica|Carica|Data|Ora|Costo|Peso|Totale|Tutti|Sì|No',
  ko: '화면 환경설정|시작 페이지|기본 프린터|기본 프린터 없음|화면 환경설정 초기화|배경|강조색|스타일|어둡게|밝게|시스템|언어|알림 언어|공지 활성화|모든 사용자에게 공지 표시|중립|따뜻함|차가움|OLED|슬레이트|숲|초록|청록|파랑|주황|보라|빨강|클래식|발광|선명함|네트워크 없음|이름|상태|활성화|비활성화|시작|중지|인쇄|다운로드|업로드|날짜|시간|비용|무게|합계|모두|예|아니요',
  nl: 'Interfacevoorkeuren|Startpagina|Standaardprinter|Geen standaardprinter|Interfacevoorkeuren herstellen|Achtergrond|Accent|Stijl|Donker|Licht|Systeem|Taal|Taal voor meldingen|Aankondigingen inschakelen|Aankondigingen aan alle gebruikers tonen|Neutraal|Warm|Koel|OLED|Leisteen|Bos|Groen|Blauwgroen|Blauw|Oranje|Paars|Rood|Klassiek|Gloed|Levendig|Geen netwerk|Naam|Status|Ingeschakeld|Uitgeschakeld|Starten|Stoppen|Afdrukken|Downloaden|Uploaden|Datum|Tijd|Kosten|Gewicht|Totaal|Alle|Ja|Nee',
  'pt-BR': 'Preferências da interface|Página inicial|Impressora padrão|Sem impressora padrão|Redefinir preferências da interface|Fundo|Destaque|Estilo|Escuro|Claro|Sistema|Idioma|Idioma das notificações|Ativar anúncios|Mostrar anúncios a todos os usuários|Neutro|Quente|Frio|OLED|Ardósia|Floresta|Verde|Verde-azulado|Azul|Laranja|Roxo|Vermelho|Clássico|Brilho|Vibrante|Sem rede|Nome|Status|Ativado|Desativado|Iniciar|Parar|Imprimir|Baixar|Enviar|Data|Hora|Custo|Peso|Total|Todos|Sim|Não',
  'zh-CN': '界面偏好|默认起始页面|默认打印机|无默认打印机|重置界面偏好|背景|强调色|样式|深色|浅色|系统|语言|通知语言|启用公告|向所有用户显示公告|中性|暖色|冷色|OLED|板岩|森林|绿色|青色|蓝色|橙色|紫色|红色|经典|发光|鲜明|无网络|名称|状态|已启用|已禁用|开始|停止|打印|下载|上传|日期|时间|费用|重量|总计|全部|是|否',
  'zh-TW': '介面偏好|預設起始頁面|預設印表機|無預設印表機|重設介面偏好|背景|強調色|樣式|深色|淺色|系統|語言|通知語言|啟用公告|向所有使用者顯示公告|中性|暖色|冷色|OLED|板岩|森林|綠色|青色|藍色|橙色|紫色|紅色|經典|發光|鮮明|無網路|名稱|狀態|已啟用|已停用|開始|停止|列印|下載|上傳|日期|時間|費用|重量|總計|全部|是|否',
  sv: 'Gränssnittsinställningar|Startsida|Standardskrivare|Ingen standardskrivare|Återställ gränssnittsinställningar|Bakgrund|Accent|Stil|Mörk|Ljus|System|Språk|Aviseringsspråk|Aktivera meddelanden|Visa meddelanden för alla användare|Neutral|Varm|Kall|OLED|Skiffer|Skog|Grön|Turkos|Blå|Orange|Lila|Röd|Klassisk|Glöd|Livfull|Inget nätverk|Namn|Status|Aktiverad|Inaktiverad|Starta|Stoppa|Skriv ut|Hämta|Ladda upp|Datum|Tid|Kostnad|Vikt|Totalt|Alla|Ja|Nej',
  tr: 'Arayüz tercihleri|Başlangıç sayfası|Varsayılan yazıcı|Varsayılan yazıcı yok|Arayüz tercihlerini sıfırla|Arka plan|Vurgu|Stil|Koyu|Açık|Sistem|Dil|Bildirim dili|Duyuruları etkinleştir|Duyuruları tüm kullanıcılara göster|Nötr|Sıcak|Soğuk|OLED|Arduvaz|Orman|Yeşil|Turkuaz|Mavi|Turuncu|Mor|Kırmızı|Klasik|Parıltı|Canlı|Ağ yok|Ad|Durum|Etkin|Devre dışı|Başlat|Durdur|Yazdır|İndir|Yükle|Tarih|Saat|Maliyet|Ağırlık|Toplam|Tümü|Evet|Hayır',
  ru: 'Настройки интерфейса|Начальная страница|Принтер по умолчанию|Без принтера по умолчанию|Сбросить настройки интерфейса|Фон|Акцент|Стиль|Тёмный|Светлый|Система|Язык|Язык уведомлений|Включить объявления|Показывать объявления всем пользователям|Нейтральный|Тёплый|Холодный|OLED|Сланец|Лес|Зелёный|Бирюзовый|Синий|Оранжевый|Фиолетовый|Красный|Классический|Свечение|Яркий|Нет сети|Название|Состояние|Включено|Отключено|Начать|Остановить|Печать|Скачать|Загрузить|Дата|Время|Стоимость|Вес|Всего|Все|Да|Нет',
  uk: 'Налаштування інтерфейсу|Початкова сторінка|Типовий принтер|Без типового принтера|Скинути налаштування інтерфейсу|Тло|Акцент|Стиль|Темний|Світлий|Система|Мова|Мова сповіщень|Увімкнути оголошення|Показувати оголошення всім користувачам|Нейтральний|Теплий|Холодний|OLED|Сланець|Ліс|Зелений|Бірюзовий|Синій|Помаранчевий|Фіолетовий|Червоний|Класичний|Світіння|Яскравий|Немає мережі|Назва|Стан|Увімкнено|Вимкнено|Почати|Зупинити|Друк|Завантажити|Вивантажити|Дата|Час|Вартість|Вага|Усього|Усі|Так|Ні',
};
export const nativeCatalogs = Object.fromEntries(
  ['en', ...Object.keys(rows)].map(language => [language, language === 'en' ? labels : {}]),
) as Record<Language, Record<string, string>>;
for (const language of Object.keys(rows) as Exclude<Language, 'en'>[]) {
  const values = rows[language].split('|');
  nativeCatalogs[language] = Object.fromEntries(Object.keys(labels).map((key, index) => [key, values[index]]));
}

const messageKeys = ['preferences.resetMessage', 'preferences.removedPrinter', 'announcements.hidden'] as const;
const messages: Record<Language, string[]> = {
  en: ['Reset local language, appearance, landing page, and archive filters? Server settings, account credentials, and server connection will not be changed.', 'Removed printer ({{id}})', 'Announcements are not available for this account.'],
  de: ['Lokale Sprache, Darstellung, Startseite und Archivfilter zurücksetzen? Servereinstellungen, Zugangsdaten und Serververbindung bleiben unverändert.', 'Entfernter Drucker ({{id}})', 'Ankündigungen sind für dieses Konto nicht verfügbar.'],
  es: ['¿Restablecer idioma, apariencia, página inicial y filtros de archivo locales? No se cambiarán los ajustes del servidor, las credenciales ni la conexión.', 'Impresora eliminada ({{id}})', 'Los anuncios no están disponibles para esta cuenta.'],
  fr: ['Réinitialiser la langue, l’apparence, la page d’accueil et les filtres locaux ? Les paramètres du serveur, les identifiants et la connexion ne seront pas modifiés.', 'Imprimante supprimée ({{id}})', 'Les annonces ne sont pas disponibles pour ce compte.'],
  ja: ['端末の言語、外観、起動ページ、アーカイブのフィルターをリセットしますか？サーバー設定、認証情報、接続先は変更されません。', '削除済みプリンター（{{id}}）', 'このアカウントではお知らせを利用できません。'],
  it: ['Ripristinare lingua, aspetto, pagina iniziale e filtri locali? Le impostazioni del server, le credenziali e la connessione non saranno modificate.', 'Stampante rimossa ({{id}})', 'Gli annunci non sono disponibili per questo account.'],
  ko: ['기기의 언어, 모양, 시작 페이지 및 보관함 필터를 초기화할까요? 서버 설정, 계정 인증 정보 및 연결은 변경되지 않습니다.', '삭제된 프린터 ({{id}})', '이 계정에서는 공지 사항을 볼 수 없습니다.'],
  nl: ['Lokale taal, uiterlijk, startpagina en archieffilters herstellen? Serverinstellingen, inloggegevens en serververbinding blijven ongewijzigd.', 'Verwijderde printer ({{id}})', 'Aankondigingen zijn niet beschikbaar voor dit account.'],
  'pt-BR': ['Redefinir idioma, aparência, página inicial e filtros locais? As configurações do servidor, credenciais e conexão não serão alteradas.', 'Impressora removida ({{id}})', 'Os anúncios não estão disponíveis para esta conta.'],
  'zh-CN': ['重置本机语言、外观、起始页面和归档筛选条件？服务器设置、账户凭据和服务器连接不会改变。', '已移除的打印机（{{id}}）', '此账户无法查看公告。'],
  'zh-TW': ['重設本機語言、外觀、起始頁面和封存篩選條件？伺服器設定、帳號憑證和伺服器連線不會改變。', '已移除的印表機（{{id}}）', '此帳號無法查看公告。'],
  sv: ['Återställ lokalt språk, utseende, startsida och arkivfilter? Serverinställningar, inloggningsuppgifter och anslutning ändras inte.', 'Borttagen skrivare ({{id}})', 'Meddelanden är inte tillgängliga för detta konto.'],
  tr: ['Yerel dil, görünüm, başlangıç sayfası ve arşiv filtreleri sıfırlansın mı? Sunucu ayarları, hesap kimlik bilgileri ve bağlantı değişmez.', 'Kaldırılan yazıcı ({{id}})', 'Bu hesap için duyurular kullanılamıyor.'],
  ru: ['Сбросить локальные язык, оформление, начальную страницу и фильтры архива? Настройки сервера, учётные данные и подключение не изменятся.', 'Удалённый принтер ({{id}})', 'Объявления недоступны для этой учётной записи.'],
  uk: ['Скинути локальні мову, оформлення, початкову сторінку та фільтри архіву? Налаштування сервера, облікові дані та підключення не зміняться.', 'Видалений принтер ({{id}})', 'Оголошення недоступні для цього облікового запису.'],
};
for (const language of Object.keys(messages) as Language[]) {
  Object.assign(nativeCatalogs[language], Object.fromEntries(messageKeys.map((key, index) => [key, messages[language][index]])));
}
const navKeys = ['users', 'virtual-printers', 'maintenance', 'profiles', 'makerworld', 'system', 'spoolbuddy', 'scanner', 'failure-analysis', 'print-log'] as const;
const navRows: Record<Language, string> = {
  en: 'Users|Virtual Printers|Maintenance|Profiles|MakerWorld|System|SpoolBuddy|Scanner|Failure Analysis|Print Log',
  de: 'Benutzer|Virtuelle Drucker|Wartung|Profile|MakerWorld|System|SpoolBuddy|Scanner|Fehleranalyse|Druckprotokoll',
  es: 'Usuarios|Impresoras virtuales|Mantenimiento|Perfiles|MakerWorld|Sistema|SpoolBuddy|Escáner|Análisis de fallos|Registro de impresión',
  fr: 'Utilisateurs|Imprimantes virtuelles|Maintenance|Profils|MakerWorld|Système|SpoolBuddy|Scanner|Analyse des échecs|Journal d’impression',
  ja: 'ユーザー|仮想プリンター|メンテナンス|プロファイル|MakerWorld|システム|SpoolBuddy|スキャナー|失敗分析|印刷ログ',
  it: 'Utenti|Stampanti virtuali|Manutenzione|Profili|MakerWorld|Sistema|SpoolBuddy|Scanner|Analisi degli errori|Registro stampe',
  ko: '사용자|가상 프린터|유지보수|프로필|MakerWorld|시스템|SpoolBuddy|스캐너|실패 분석|인쇄 기록',
  nl: 'Gebruikers|Virtuele printers|Onderhoud|Profielen|MakerWorld|Systeem|SpoolBuddy|Scanner|Foutanalyse|Afdruklogboek',
  'pt-BR': 'Usuários|Impressoras virtuais|Manutenção|Perfis|MakerWorld|Sistema|SpoolBuddy|Scanner|Análise de falhas|Registro de impressão',
  'zh-CN': '用户|虚拟打印机|维护|配置文件|MakerWorld|系统|SpoolBuddy|扫描器|故障分析|打印日志',
  'zh-TW': '使用者|虛擬印表機|維護|設定檔|MakerWorld|系統|SpoolBuddy|掃描器|失敗分析|列印日誌',
  sv: 'Användare|Virtuella skrivare|Underhåll|Profiler|MakerWorld|System|SpoolBuddy|Skanner|Felanalys|Utskriftslogg',
  tr: 'Kullanıcılar|Sanal yazıcılar|Bakım|Profiller|MakerWorld|Sistem|SpoolBuddy|Tarayıcı|Hata analizi|Yazdırma günlüğü',
  ru: 'Пользователи|Виртуальные принтеры|Обслуживание|Профили|MakerWorld|Система|SpoolBuddy|Сканер|Анализ сбоев|Журнал печати',
  uk: 'Користувачі|Віртуальні принтери|Обслуговування|Профілі|MakerWorld|Система|SpoolBuddy|Сканер|Аналіз збоїв|Журнал друку',
};
for (const language of Object.keys(navRows) as Language[]) {
  const values = navRows[language].split('|');
  Object.assign(nativeCatalogs[language], Object.fromEntries(navKeys.map((key, index) => [`nav.${key}`, values[index]])));
}
const moreKeys = [
  'more.signedIn', 'more.guest', 'more.demo', 'more.pages', 'more.insights', 'more.links',
  'more.disconnecting', 'more.exitDemo', 'more.changeServer', 'more.leaveDemo', 'more.disconnectHelp',
  'more.signingOut', 'more.signOut', 'more.signOutHelp', 'more.externalProtocol', 'more.externalError',
  'nav.camera-wall', 'nav.camera-integrations', 'nav.slicer-pipelines', 'nav.pipeline-runs', 'nav.finance',
];
const moreRows: Record<Language, string> = {
  en: 'Signed in as {{username}}|Guest|Demo mode — you are exploring a shared sample server. Use Exit demo below to connect your own.|Pages|Insights & tools|Links|Disconnecting...|Exit demo|Change server|Leave the demo and connect to your own BambuBuddy server|Disconnect and connect to a different BambuBuddy server|Signing out...|Sign out|Disconnect this mobile session|External links must start with http:// or https://|Unable to open the external link.|Camera wall|Camera integrations|Slicer pipelines|Pipeline runs|Finance',
  de: 'Angemeldet als {{username}}|Gast|Demomodus — Sie erkunden einen gemeinsamen Beispielserver. Wählen Sie unten „Demo verlassen“, um Ihren eigenen zu verbinden.|Seiten|Auswertungen und Werkzeuge|Links|Verbindung wird getrennt...|Demo verlassen|Server wechseln|Demo verlassen und mit Ihrem eigenen BambuBuddy-Server verbinden|Verbindung trennen und mit einem anderen BambuBuddy-Server verbinden|Abmeldung läuft...|Abmelden|Diese mobile Sitzung beenden|Externe Links müssen mit http:// oder https:// beginnen|Der externe Link konnte nicht geöffnet werden.|Kameraübersicht|Kameraintegrationen|Slicer-Pipelines|Pipeline-Ausführungen|Finanzen',
  es: 'Sesión iniciada como {{username}}|Invitado|Modo demo: está explorando un servidor de ejemplo compartido. Pulse Salir de la demo para conectar el suyo.|Páginas|Análisis y herramientas|Enlaces|Desconectando...|Salir de la demo|Cambiar servidor|Salir de la demo y conectar su propio servidor BambuBuddy|Desconectar y conectar a otro servidor BambuBuddy|Cerrando sesión...|Cerrar sesión|Desconectar esta sesión móvil|Los enlaces externos deben comenzar con http:// o https://|No se pudo abrir el enlace externo.|Mosaico de cámaras|Integraciones de cámaras|Flujos de laminado|Ejecuciones de flujos|Finanzas',
  fr: 'Connecté en tant que {{username}}|Invité|Mode démo : vous explorez un serveur d’exemple partagé. Quittez la démo ci-dessous pour connecter le vôtre.|Pages|Analyses et outils|Liens|Déconnexion...|Quitter la démo|Changer de serveur|Quitter la démo et connecter votre serveur BambuBuddy|Déconnecter et connecter un autre serveur BambuBuddy|Déconnexion du compte...|Se déconnecter|Fermer cette session mobile|Les liens externes doivent commencer par http:// ou https://|Impossible d’ouvrir le lien externe.|Mosaïque de caméras|Intégrations caméra|Chaînes de tranchage|Exécutions des chaînes|Finances',
  ja: '{{username}} としてログイン中|ゲスト|デモモード — 共有サンプルサーバーを表示しています。自分のサーバーに接続するには下の「デモを終了」を選択してください。|ページ|分析とツール|リンク|切断中...|デモを終了|サーバーを変更|デモを終了して自分の BambuBuddy サーバーに接続|切断して別の BambuBuddy サーバーに接続|ログアウト中...|ログアウト|このモバイルセッションを切断|外部リンクは http:// または https:// で始まる必要があります|外部リンクを開けませんでした。|カメラ一覧|カメラ連携|スライスパイプライン|パイプラインの実行履歴|会計',
  it: 'Accesso come {{username}}|Ospite|Modalità demo: stai esplorando un server di esempio condiviso. Esci dalla demo per collegare il tuo.|Pagine|Analisi e strumenti|Collegamenti|Disconnessione...|Esci dalla demo|Cambia server|Esci dalla demo e collega il tuo server BambuBuddy|Disconnetti e collega un altro server BambuBuddy|Uscita in corso...|Esci|Chiudi questa sessione mobile|I collegamenti esterni devono iniziare con http:// o https://|Impossibile aprire il collegamento esterno.|Mosaico videocamere|Integrazioni videocamera|Pipeline di slicing|Esecuzioni pipeline|Finanze',
  ko: '{{username}} 계정으로 로그인됨|게스트|데모 모드 — 공유 예제 서버를 둘러보고 있습니다. 본인 서버에 연결하려면 아래에서 데모 종료를 선택하세요.|페이지|분석 및 도구|링크|연결 해제 중...|데모 종료|서버 변경|데모를 종료하고 본인의 BambuBuddy 서버에 연결|연결을 해제하고 다른 BambuBuddy 서버에 연결|로그아웃 중...|로그아웃|이 모바일 세션 연결 해제|외부 링크는 http:// 또는 https:// 로 시작해야 합니다|외부 링크를 열 수 없습니다.|카메라 모아 보기|카메라 통합|슬라이서 파이프라인|파이프라인 실행 기록|재무',
  nl: 'Aangemeld als {{username}}|Gast|Demomodus — u bekijkt een gedeelde voorbeeldserver. Kies hieronder Demo verlaten om uw eigen server te verbinden.|Pagina’s|Inzichten en hulpmiddelen|Links|Verbinding verbreken...|Demo verlaten|Server wijzigen|Verlaat de demo en verbind uw eigen BambuBuddy-server|Verbreek de verbinding en verbind een andere BambuBuddy-server|Afmelden...|Afmelden|Deze mobiele sessie afsluiten|Externe links moeten beginnen met http:// of https://|De externe link kon niet worden geopend.|Cameraoverzicht|Camera-integraties|Slicer-pipelines|Pipeline-uitvoeringen|Financiën',
  'pt-BR': 'Conectado como {{username}}|Visitante|Modo demo — você está explorando um servidor de exemplo compartilhado. Use Sair da demo abaixo para conectar o seu.|Páginas|Análises e ferramentas|Links|Desconectando...|Sair da demo|Alterar servidor|Sair da demo e conectar seu próprio servidor BambuBuddy|Desconectar e conectar a outro servidor BambuBuddy|Saindo...|Sair|Encerrar esta sessão móvel|Links externos devem começar com http:// ou https://|Não foi possível abrir o link externo.|Mosaico de câmeras|Integrações de câmeras|Fluxos de fatiamento|Execuções dos fluxos|Finanças',
  'zh-CN': '已登录为 {{username}}|访客|演示模式 — 您正在浏览共享示例服务器。请在下方退出演示以连接您自己的服务器。|页面|分析与工具|链接|正在断开连接...|退出演示|更换服务器|退出演示并连接您自己的 BambuBuddy 服务器|断开连接并连接其他 BambuBuddy 服务器|正在退出登录...|退出登录|结束此移动端会话|外部链接必须以 http:// 或 https:// 开头|无法打开外部链接。|摄像头墙|摄像头集成|切片流水线|流水线运行记录|财务',
  'zh-TW': '已登入為 {{username}}|訪客|示範模式 — 您正在瀏覽共用範例伺服器。請在下方退出示範以連接您自己的伺服器。|頁面|分析與工具|連結|正在中斷連線...|退出示範|更換伺服器|退出示範並連接您自己的 BambuBuddy 伺服器|中斷連線並連接其他 BambuBuddy 伺服器|正在登出...|登出|結束此行動裝置工作階段|外部連結必須以 http:// 或 https:// 開頭|無法開啟外部連結。|攝影機牆|攝影機整合|切片流程|流程執行紀錄|財務',
  sv: 'Inloggad som {{username}}|Gäst|Demoläge — du utforskar en delad exempelserver. Välj Avsluta demo nedan för att ansluta din egen.|Sidor|Insikter och verktyg|Länkar|Kopplar från...|Avsluta demo|Byt server|Lämna demon och anslut din egen BambuBuddy-server|Koppla från och anslut en annan BambuBuddy-server|Loggar ut...|Logga ut|Avsluta denna mobila session|Externa länkar måste börja med http:// eller https://|Kunde inte öppna den externa länken.|Kameraöversikt|Kameraintegrationer|Slicer-pipelines|Pipelinekörningar|Ekonomi',
  tr: '{{username}} olarak giriş yapıldı|Misafir|Demo modu — paylaşılan örnek sunucuyu inceliyorsunuz. Kendi sunucunuza bağlanmak için aşağıdan demodan çıkın.|Sayfalar|Analizler ve araçlar|Bağlantılar|Bağlantı kesiliyor...|Demodan çık|Sunucuyu değiştir|Demodan çıkıp kendi BambuBuddy sunucunuza bağlanın|Bağlantıyı kesip başka bir BambuBuddy sunucusuna bağlanın|Çıkış yapılıyor...|Çıkış yap|Bu mobil oturumu kapat|Harici bağlantılar http:// veya https:// ile başlamalıdır|Harici bağlantı açılamadı.|Kamera duvarı|Kamera entegrasyonları|Dilimleyici işlem hatları|İşlem hattı çalıştırmaları|Finans',
  ru: 'Вход выполнен как {{username}}|Гость|Демо-режим — вы просматриваете общий пример сервера. Выберите выход из демо ниже, чтобы подключить свой.|Страницы|Аналитика и инструменты|Ссылки|Отключение...|Выйти из демо|Сменить сервер|Выйти из демо и подключить свой сервер BambuBuddy|Отключиться и подключить другой сервер BambuBuddy|Выход...|Выйти|Завершить эту мобильную сессию|Внешние ссылки должны начинаться с http:// или https://|Не удалось открыть внешнюю ссылку.|Обзор камер|Интеграции камер|Конвейеры слайсинга|Запуски конвейеров|Финансы',
  uk: 'Вхід виконано як {{username}}|Гість|Демо-режим — ви переглядаєте спільний приклад сервера. Вийдіть із демо нижче, щоб підключити власний.|Сторінки|Аналітика та інструменти|Посилання|Відключення...|Вийти з демо|Змінити сервер|Вийти з демо та підключити власний сервер BambuBuddy|Відключитися та підключити інший сервер BambuBuddy|Вихід...|Вийти|Завершити цю мобільну сесію|Зовнішні посилання мають починатися з http:// або https://|Не вдалося відкрити зовнішнє посилання.|Огляд камер|Інтеграції камер|Конвеєри нарізання|Запуски конвеєрів|Фінанси',
};
for (const language of Object.keys(moreRows) as Language[]) {
  const values = moreRows[language].split('|');
  Object.assign(nativeCatalogs[language], Object.fromEntries(moreKeys.map((key, index) => [key, values[index]])));
}
