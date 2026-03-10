export type StepAction =
  | 'tap' | 'swipe' | 'type' | 'longpress'
  | 'back' | 'home' | 'scroll' | 'wait'
  | 'assert_text' | 'assert_element' | 'assert_url'
  | 'screenshot' | 'navigate' | 'open_app';

export interface TestStep {
  id: string;
  num: number;
  action: StepAction;
  target?: string;       // seletor de elemento ou coordenadas "x,y"
  value?: string;        // texto a digitar, URL, etc.
  description?: string;  // descrição legível para humanos
  timeout_ms?: number;
  screenshot_after?: boolean;
}
