// 画面遷移ガードのシングルトンレジストリ。
// CreateView など「未保存の編集状態」を持つ画面がガード関数を登録し、
// App 側の遷移処理（キャラ切替・モード切替）が遷移前に実行する。
//
// ガード関数は「遷移してよいか」を Promise<boolean> で返す。
// false の場合、呼び出し側は遷移を中止する。

type NavigationGuard = () => Promise<boolean>;

let currentGuard: NavigationGuard | null = null;

export const setNavigationGuard = (guard: NavigationGuard | null): void => {
    currentGuard = guard;
};

export const runNavigationGuard = async (): Promise<boolean> => {
    if (!currentGuard) return true;
    return currentGuard();
};
