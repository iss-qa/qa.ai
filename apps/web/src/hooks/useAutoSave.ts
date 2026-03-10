import { useEffect } from 'react';
import { useTestEditor } from '../store/testEditor';

export function useAutoSave(testCaseId: string) {
    const isDirty = useTestEditor((state) => state.isDirty);
    const setSaving = useTestEditor((state) => state.setSaving);
    const markSaved = useTestEditor((state) => state.markSaved);
    const testCase = useTestEditor((state) => state.testCase);

    useEffect(() => {
        if (!isDirty || !testCase) return;

        const timer = setTimeout(async () => {
            try {
                setSaving(true);
                // FIXME: API call to save testCase to Supabase
                // await fetchApi(`/tests/${testCaseId}`, { method: 'PUT', body: JSON.stringify(testCase) });

                // Simulating network delay
                await new Promise(resolve => setTimeout(resolve, 800));

                markSaved();
            } catch (error) {
                console.error('Failed to auto-save:', error);
                setSaving(false);
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [isDirty, testCase, testCaseId, markSaved, setSaving]);
}
