// De push-notification handler (Notifications.setNotificationHandler) wordt
// op module-niveau geregistreerd, bij het opstarten van de app — dus buiten
// elke React-component en zonder toegang tot hooks zoals useRole().
//
// Dit kleine losstaande modulevariabele laat RootLayout (waar useRole() wel
// beschikbaar is) de huidige rol "doorgeven" aan de handler, zodat die kan
// beslissen of een binnenkomend geluid überhaupt op dit toestel hoort te
// spelen.

type AppRole = "patient" | "mantelzorger" | null;

let currentRole: AppRole = null;

export const setCurrentRoleForNotifications = (role: AppRole) => {
  currentRole = role;
};

export const getCurrentRoleForNotifications = (): AppRole => currentRole;