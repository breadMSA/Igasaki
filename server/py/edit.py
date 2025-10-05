import asyncio
from PyCharacterAI import get_client

# 你的設定
CHARACTERAI_CHAT_ID = "cac30cc4-9b28-44e3-a3c7-a4c71c8d1c62"
CHARACTERAI_CHARACTER_ID = "7ZSNhkW6YSiCxrGweo4zoIbSKsE1unLljfLXZV2g-Xc"
# 注意：CHARACTERAI_CHARACTER_ID 在這裡不是必須的，但保留供參考

# 用你的 token 替換 "TOKEN"
token = "13a839be7b725fdeebbcc3de4b215540989e1570"

async def main():
    # 建立一個 PyCharacterAI 客戶端實例
    client = await get_client(token=token)

    try:
        # 直接使用你提供的聊天室 ID
        chat_id = CHARACTERAI_CHAT_ID
        print(f"將在指定的聊天室 {chat_id} 中編輯訊息。")

        # 1. 獲取聊天中的最新訊息
        # fetch_messages() 預設會返回最近的訊息
        messages, _ = await client.chat.fetch_messages(chat_id)
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
            original_text = latest_bot_message.get_primary_candidate().text
            print(f"機器人的最新訊息是: {original_text}")

            # 2. 取得編輯所需的 ID
            turn_id = latest_bot_message.turn_id
            candidate_id = latest_bot_message.get_primary_candidate().candidate_id
            
            # 設定新的訊息內容
            new_text = "這是一個新編輯過的訊息！"
            
            print(f"正在編輯訊息 turn_id: {turn_id} 和 candidate_id: {candidate_id}...")
            
            # 3. 呼叫 edit_message 方法進行編輯
            edited_message = await client.chat.edit_message(chat_id, turn_id, candidate_id, new_text)

            # 顯示編輯後的訊息
            print(f"訊息已成功編輯！新內容是: {edited_message.get_primary_candidate().text}")

        else:
            print("沒有找到機器人訊息可以編輯。")

    finally:
        await client.close_session()

asyncio.run(main())