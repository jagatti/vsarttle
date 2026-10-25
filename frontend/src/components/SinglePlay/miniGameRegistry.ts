export interface MiniGameDefinition {
  id: string;
  icon?: string;
  name: string;
  description: string;
}

export const MINI_GAME_REGISTRY: MiniGameDefinition[] = [
  {
    id: "dance-battle",
    name: "煌け!ダンス★バトル",
    description: "リズムにのってスタミナ管理し、ラクガキチームでダンスバトル！",
  },
];
