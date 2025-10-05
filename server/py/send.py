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

async def main():
    # 建立一個 PyCharacterAI 客戶端實例
    client = await get_client(token=token)

    try:
        # 從命令行參數獲取要發送的文本
        import sys
        text_to_speak = sys.argv[1] if len(sys.argv) > 1 else "Hello, this is a test message."
        
        # 要發送的訊息
        my_message = f"請說出以下話語，不要講任何其他話：{text_to_speak}"

        print(f"正在向聊天室 {CHARACTERAI_CHAT_ID} 發送訊息...")
        print(f"要朗讀的文本: {text_to_speak}")

        # 使用 client.chat.send_message 方法發送訊息
        answer = await client.chat.send_message(
            character_id=CHARACTERAI_CHARACTER_ID, 
            chat_id=CHARACTERAI_CHAT_ID, 
            text=my_message
        )

        # 印出機器人的回覆
        bot_response = answer.get_primary_candidate().text
        print(f"機器人回覆: {bot_response}")

    except Exception as e:
        print(f"發生錯誤：{e}")

    finally:
        # 關閉連線
        await client.close_session()

asyncio.run(main())