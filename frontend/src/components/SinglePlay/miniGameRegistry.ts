export interface MiniGameDefinition {
  id: string;
  icon: string;
  name: string;
  description: string;
}

export const MINI_GAME_REGISTRY: MiniGameDefinition[] = [
  {
    id: "dance-battle",
    icon: "💃",
    name: "煌け!ダンス★バトル",
    description: "リズムに合わせてキーを入力し、ラクガキチームでダンスバトル！",
  },
];
