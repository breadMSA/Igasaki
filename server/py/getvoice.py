import asyncio

from PyCharacterAI import get_client

# 用你自己的 token 替換 "TOKEN"
token = "13a839be7b725fdeebbcc3de4b215540989e1570"

async def main():
    client = await get_client(token=token)

    voice_name = "美麗的遐蝶"
    voices = await client.utils.search_voices(voice_name)

    print(f"search results for {voice_name}: ")

    for voice in voices:
        print(f"{voice.name} [{voice.voice_id}]")

    await client.close_session()

asyncio.run(main())