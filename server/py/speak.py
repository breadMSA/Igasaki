import asyncio
import os
from dotenv import load_dotenv
from PyCharacterAI import get_client

# 載入環境變數
load_dotenv()

# 從環境變數獲取設定
CHARACTERAI_CHAT_ID = os.getenv("CHARACTERAI_CHAT_ID")
CHARACTERAI_CHARACTER_ID = os.getenv("CHARACTERAI_CHARACTER_ID")
token = os.getenv("CHARACTERAI_TOKEN")
voice_id = os.getenv("VOICE_ID", "68b250ec-20a8-4154-a12f-93c9cb688c2b") 

async def main():
    # 建立一個 PyCharacterAI 客戶端實例
    client = await get_client(token=token)

    try:
        # 1. 獲取聊天中的最新訊息
        messages, _ = await client.chat.fetch_messages(CHARACTERAI_CHAT_ID)
        
        if not messages:
            print("聊天中沒有訊息。")
            return

        # 找到最新的機器人訊息
        latest_bot_message = None
        for message in messages:
            if not message.author_is_human:
                latest_bot_message = message
                break

        if latest_bot_message:
            # 2. 取得語音生成所需的 ID
            turn_id = latest_bot_message.turn_id
            candidate_id = latest_bot_message.get_primary_candidate().candidate_id
            
            print(f"找到機器人的最新訊息 turn_id: {turn_id} 和 candidate_id: {candidate_id}")
            
            # 3. 呼叫 generate_speech 方法並將其儲存為檔案
            speech_bytes = await client.utils.generate_speech(
                chat_id=CHARACTERAI_CHAT_ID, 
                turn_id=turn_id, 
                candidate_id=candidate_id, 
                voice_id=voice_id
            )

            # 將語音內容寫入 MP3 檔案
            filepath = "bot_speech.mp3"
            with open(filepath, 'wb') as f:
                f.write(speech_bytes)

            print(f"機器人的回覆已成功轉為語音並儲存為 {filepath}")

        else:
            print("沒有找到機器人訊息可以轉換為語音。")

    except Exception as e:
        print(f"發生錯誤：{e}")

    finally:
        # 關閉連線
        await client.close_session()

asyncio.run(main())