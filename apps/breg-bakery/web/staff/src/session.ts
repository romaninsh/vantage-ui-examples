// The signed-in token lives in sessionStorage, so it lasts as long as the tab.

const KEY = "vantage.token";

export const readToken = () => sessionStorage.getItem(KEY);
export const saveToken = (token: string) => sessionStorage.setItem(KEY, token);
export const clearToken = () => sessionStorage.removeItem(KEY);
