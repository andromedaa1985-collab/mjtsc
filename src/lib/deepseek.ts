import { db, auth } from './firebase';
import { doc, increment, updateDoc } from 'firebase/firestore';

export async function generateDeepSeekContent(prompt: string, isJson: boolean = false) {
  try {
    const response = await fetch('/api/deepseek', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: prompt }
        ],
        responseFormat: isJson ? { type: 'json_object' } : { type: 'text' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    let content = data.content;
    const usage = data.usage;
    
    if (isJson && content) {
      // Remove markdown code block syntax if DeepSeek includes it despite json_object mode
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    // Deduct credits automatically
    const userId = auth.currentUser?.uid;
    if (userId && usage && usage.total_tokens) {
      try {
        const userRef = doc(db, 'users', userId);
        // 1 token = 1 credit for simplicity
        await updateDoc(userRef, {
          credits: increment(-usage.total_tokens)
        });
      } catch (e) {
        console.error("Failed to deduct credits:", e);
      }
    }
    
    return content;
  } catch (error) {
    console.error('DeepSeek API call failed:', error);
    throw error;
  }
}
