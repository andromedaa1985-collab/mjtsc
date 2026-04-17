import { db, auth } from './firebase';
import { doc, increment, updateDoc } from 'firebase/firestore';

export async function generateGeminiContent(prompt: string, imageBase64?: string, mimeType?: string) {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        imageBase64,
        mimeType
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const content = data.content;
    const usage = data.usage;

    // Deduct credits automatically
    const userId = auth.currentUser?.uid;
    if (userId && usage && usage.totalTokenCount) {
      try {
        const userRef = doc(db, 'users', userId);
        // 1 token = 1 credit for simplicity
        await updateDoc(userRef, {
          credits: increment(-usage.totalTokenCount)
        });
      } catch (e) {
        console.error("Failed to deduct credits:", e);
      }
    }
    
    return content;
  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw error;
  }
}
