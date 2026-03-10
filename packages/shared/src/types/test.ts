import { TestStep } from './step';

export interface TestCase {
    id: string;
    project_id: string;
    name: string;
    description?: string;
    prompt_original?: string;
    steps: TestStep[];
    tags: string[];
    is_active: boolean;
    version: number;
}
