/**
 * 이모지 목록 — 분류 여덟 · 한 줄에 「글자 키워드…」(한글·영어, 공백으로 나눔). 외부 패키지 없이 유니코드 글자만 적는다.
 *   검색은 키워드·분류 이름의 부분 일치. 키워드가 없는 글자는 분류 이름으로만 걸린다.
 */
export interface EmojiItem { char: string; keywords: string[]; cat: string }
export interface EmojiCategory { id: string; label: string; icon: string; items: EmojiItem[] }

const RAW: { id: string; label: string; icon: string; lines: string }[] = [
    { id: 'people', label: '사람', icon: '😀', lines: `
😀 웃음 기쁨 smile grin
😃 웃음 활짝 happy
😄 웃음 신남 joy
😁 씩 grin beam
😆 크게웃음 laugh
😅 식은땀 sweat
🤣 폭소 rofl lol
😂 눈물웃음 joy tears
🙂 미소 slight smile
🙃 거꾸로 upside
😉 윙크 wink
😊 방긋 blush
😇 천사 angel halo
🥰 사랑 하트얼굴 love
😍 반함 heart eyes
🤩 별눈 star struck
😘 키스 kiss
😋 맛있다 yum
😛 메롱 tongue
😜 장난 wink tongue
🤪 엉뚱 zany crazy
🤗 포옹 hug
🤔 생각 고민 think
🤨 의심 raised brow
😐 무표정 neutral
😑 무덤덤 expressionless
😶 말없음 no mouth
🙄 눈굴림 eye roll
😏 능글 smirk
😣 괴로움 persevere
😥 안도 relieved sad
😮 놀람 open mouth
🤐 지퍼 입다묾 zipper
😯 헉 hushed
😪 졸림 sleepy
😫 지침 tired
😴 잠 수면 sleep zzz
😌 안심 relieved
😎 멋짐 선글라스 cool sunglasses
🤓 공부 범생 nerd
🧐 monocle 관찰
😕 곤란 confused
😟 걱정 worried
🙁 슬픔 frown
😮‍💨 한숨 sigh
😢 눈물 cry
😭 오열 sob
😱 비명 scream
😖 혼란 confounded
😞 실망 disappointed
😓 진땀 downcast
😩 지침 weary
😤 씩씩 triumph
😡 화남 분노 angry
😠 짜증 mad
🤬 욕 swearing
😈 악마 devil
👿 화난악마 imp
💀 해골 skull
☠️ 해골뼈 crossbones
💩 똥 poop
🤡 광대 clown
👻 유령 ghost
👽 외계인 alien
🤖 로봇 robot
😺 고양이 cat
🙈 원숭이 안봄 see no evil
🙉 안들음 hear no evil
🙊 말안함 speak no evil
👋 손인사 안녕 wave
🤚 손바닥 raised hand
🖐️ 손 펼침 hand
✋ 정지 stop hand
👌 오케이 ok
🤌 손모음 pinched
✌️ 브이 victory peace
🤞 행운 crossed fingers
🤟 사랑해 love you
🤘 락 rock
👈 왼쪽 point left
👉 오른쪽 point right
👆 위 point up
👇 아래 point down
☝️ 검지 one up
👍 좋아요 엄지 thumbs up
👎 싫어요 thumbs down
✊ 주먹 fist
👊 펀치 punch
👏 박수 clap
🙌 만세 raise hands
🤝 악수 handshake 협력
🙏 기도 부탁 pray thanks
✍️ 글쓰기 write
💪 근육 힘 muscle
👀 눈 구경 eyes
👁️ 눈하나 eye
🧠 두뇌 brain
👂 귀 ear
👃 코 nose
👄 입 mouth
👶 아기 baby
👧 소녀 girl
🧒 어린이 child
👦 소년 boy
👩 여자 woman
👨 남자 man
🧑 사람 person
👵 할머니 old woman
👴 할아버지 old man
👮 경찰 police
🧑‍🏫 선생님 교사 teacher
🧑‍🎓 학생 student
🧑‍💻 개발자 프로그래머 coder
🧑‍🍳 요리사 cook
🧑‍⚕️ 의사 doctor
🧑‍🔧 정비사 mechanic
🧑‍🎨 화가 artist
🧑‍🚀 우주비행사 astronaut
🧑‍🚒 소방관 firefighter
🦸 영웅 hero
🧙 마법사 mage
🧚 요정 fairy
🧛 흡혈귀 vampire
🧜 인어 mermaid
🧞 지니 genie
🕴️ 정장 levitating
💃 춤 dance
🕺 춤남 dancer
🚶 걷기 walk
🏃 달리기 run
🧘 명상 요가 yoga
👪 가족 family
👥 사람들 group silhouettes
👤 사람 그림자 silhouette
🗣️ 말 speaking
💋 입맞춤 lips kiss
💘 화살하트 heart arrow
💝 선물하트 heart gift
❤️ 하트 빨강 사랑 red heart
🧡 주황하트 orange heart
💛 노랑하트 yellow heart
💚 초록하트 green heart
💙 파랑하트 blue heart
💜 보라하트 purple heart
🖤 검정하트 black heart
🤍 하얀하트 white heart
💔 깨진하트 broken heart
💕 두하트 two hearts
💖 반짝하트 sparkling heart
💯 백점 100
💢 분노표시 anger
💥 충돌 폭발 boom
💫 어지러움 dizzy
💦 땀 물방울 sweat
💨 바람 dash
💬 말풍선 chat speech
💭 생각풍선 thought
🕳️ 구멍 hole
` },
    { id: 'nature', label: '동물·자연', icon: '🌿', lines: `
🐶 강아지 개 dog
🐱 고양이 cat
🐭 쥐 mouse
🐹 햄스터 hamster
🐰 토끼 rabbit
🦊 여우 fox
🐻 곰 bear
🐼 판다 panda
🐨 코알라 koala
🐯 호랑이 tiger
🦁 사자 lion
🐮 소 cow
🐷 돼지 pig
🐸 개구리 frog
🐵 원숭이 monkey
🐔 닭 chicken
🐧 펭귄 penguin
🐦 새 bird
🐤 병아리 chick
🦆 오리 duck
🦅 독수리 eagle
🦉 부엉이 올빼미 owl
🦇 박쥐 bat
🐺 늑대 wolf
🐗 멧돼지 boar
🐴 말 horse
🦄 유니콘 unicorn
🐝 벌 꿀벌 bee
🐛 애벌레 bug
🦋 나비 butterfly
🐌 달팽이 snail
🐞 무당벌레 ladybug
🐜 개미 ant
🕷️ 거미 spider
🦂 전갈 scorpion
🐢 거북이 turtle
🐍 뱀 snake
🦎 도마뱀 lizard
🐙 문어 octopus
🦑 오징어 squid
🦀 게 crab
🐠 열대어 fish
🐟 물고기 fish
🐬 돌고래 dolphin
🐳 고래 whale
🦈 상어 shark
🐊 악어 crocodile
🐘 코끼리 elephant
🦒 기린 giraffe
🦓 얼룩말 zebra
🐪 낙타 camel
🐑 양 sheep
🐐 염소 goat
🐇 토끼 rabbit
🐿️ 다람쥐 chipmunk
🦔 고슴도치 hedgehog
🦥 나무늘보 sloth
🌵 선인장 cactus
🎄 크리스마스트리 tree
🌲 소나무 evergreen
🌳 나무 tree
🌴 야자수 palm
🌱 새싹 seedling
🌿 풀 herb
☘️ 클로버 shamrock
🍀 네잎클로버 행운 clover
🎍 대나무 bamboo
🍃 나뭇잎 leaf
🍂 낙엽 가을 fallen leaf
🍁 단풍 maple
🍄 버섯 mushroom
🌾 벼 rice
💐 꽃다발 bouquet
🌷 튤립 tulip
🌹 장미 rose
🌺 히비스커스 hibiscus
🌸 벚꽃 cherry blossom
🌼 꽃 blossom
🌻 해바라기 sunflower
🌞 해얼굴 sun face
🌝 보름달얼굴 full moon face
🌙 달 초승달 moon
⭐ 별 star
🌟 반짝별 glowing star
✨ 반짝 sparkles
⚡ 번개 전기 lightning
🔥 불 fire
🌈 무지개 rainbow
☀️ 해 맑음 sun
⛅ 구름해 partly cloudy
☁️ 구름 cloud
🌧️ 비 rain
⛈️ 천둥 thunder
🌨️ 눈 snow
❄️ 눈송이 snowflake
☃️ 눈사람 snowman
💧 물방울 droplet
🌊 파도 바다 wave
🌍 지구 earth
🌎 지구 아메리카 earth americas
🌏 지구 아시아 earth asia
🪐 토성 행성 planet
🌋 화산 volcano
🏔️ 산 mountain
⛰️ 산 mountain
🏝️ 섬 island
🏜️ 사막 desert
🪨 바위 rock
🪵 통나무 wood
` },
    { id: 'food', label: '음식', icon: '🍎', lines: `
🍏 풋사과 green apple
🍎 사과 apple
🍐 배 pear
🍊 귤 오렌지 orange
🍋 레몬 lemon
🍌 바나나 banana
🍉 수박 watermelon
🍇 포도 grape
🍓 딸기 strawberry
🫐 블루베리 blueberry
🍈 멜론 melon
🍒 체리 cherry
🍑 복숭아 peach
🥭 망고 mango
🍍 파인애플 pineapple
🥥 코코넛 coconut
🥝 키위 kiwi
🍅 토마토 tomato
🍆 가지 eggplant
🥑 아보카도 avocado
🥦 브로콜리 broccoli
🥬 배추 lettuce
🥒 오이 cucumber
🌶️ 고추 pepper
🌽 옥수수 corn
🥕 당근 carrot
🧄 마늘 garlic
🧅 양파 onion
🥔 감자 potato
🍠 고구마 sweet potato
🥐 크루아상 croissant
🍞 빵 bread
🥖 바게트 baguette
🧀 치즈 cheese
🥚 달걀 계란 egg
🍳 계란프라이 fried egg
🥞 팬케이크 pancake
🥓 베이컨 bacon
🥩 고기 meat
🍗 닭다리 chicken leg
🍖 갈비 meat bone
🌭 핫도그 hotdog
🍔 햄버거 hamburger
🍟 감자튀김 fries
🍕 피자 pizza
🥪 샌드위치 sandwich
🌮 타코 taco
🌯 부리또 burrito
🥗 샐러드 salad
🍿 팝콘 popcorn
🍱 도시락 bento
🍘 센베 rice cracker
🍙 주먹밥 rice ball
🍚 밥 rice
🍛 카레 curry
🍜 라면 국수 ramen noodle
🍝 파스타 spaghetti
🍣 초밥 sushi
🍤 새우튀김 shrimp
🍥 어묵 fish cake
🥟 만두 dumpling
🥠 포춘쿠키 fortune cookie
🍢 꼬치 oden
🍡 경단 dango
🍦 아이스크림 ice cream
🍧 빙수 shaved ice
🍨 아이스 ice cream
🍩 도넛 donut
🍪 쿠키 cookie
🎂 케이크 생일 cake birthday
🍰 조각케이크 shortcake
🧁 컵케이크 cupcake
🍫 초콜릿 chocolate
🍬 사탕 candy
🍭 막대사탕 lollipop
🍮 푸딩 custard
🍯 꿀 honey
🍼 젖병 bottle
🥛 우유 milk
☕ 커피 coffee
🍵 차 tea
🍶 술 sake
🍺 맥주 beer
🍷 와인 wine
🍸 칵테일 cocktail
🥂 건배 cheers
🥤 음료 컵 drink
🧃 주스 juice
🧊 얼음 ice
🥢 젓가락 chopsticks
🍴 포크 나이프 식사 fork knife
🍽️ 접시 식사 plate
🥄 숟가락 spoon
` },
    { id: 'activity', label: '활동', icon: '⚽', lines: `
⚽ 축구 soccer
🏀 농구 basketball
🏈 미식축구 football
⚾ 야구 baseball
🎾 테니스 tennis
🏐 배구 volleyball
🏉 럭비 rugby
🎱 당구 billiards
🏓 탁구 pingpong
🏸 배드민턴 badminton
🥅 골대 goal
🏒 하키 hockey
🥍 라크로스 lacrosse
🏏 크리켓 cricket
⛳ 골프 golf
🏹 양궁 활 archery
🎣 낚시 fishing
🥊 권투 boxing
🥋 태권도 유도 martial arts
🎽 달리기 러닝 running shirt
🛹 스케이트보드 skateboard
⛸️ 스케이트 ice skate
🎿 스키 ski
🏂 스노보드 snowboard
🏋️ 역도 weight lifting
🤸 체조 gymnastics
🚴 자전거 bike
🏊 수영 swim
🏄 서핑 surf
🧗 암벽등반 climbing
🏆 트로피 우승 trophy
🥇 금메달 gold medal
🥈 은메달 silver medal
🥉 동메달 bronze medal
🏅 메달 medal
🎖️ 훈장 military medal
🎗️ 리본 reminder ribbon
🎫 티켓 ticket
🎟️ 입장권 admission
🎪 서커스 circus
🎭 연극 가면 theater
🎨 미술 팔레트 art palette
🎬 영화 clapper
🎤 마이크 노래 microphone
🎧 헤드폰 음악 headphone
🎼 악보 score
🎹 피아노 piano
🥁 드럼 drum
🎷 색소폰 sax
🎺 트럼펫 trumpet
🎸 기타 guitar
🎻 바이올린 violin
🎲 주사위 dice
♟️ 체스 chess
🎯 과녁 목표 dart target
🎳 볼링 bowling
🎮 게임 game
🕹️ 조이스틱 joystick
🧩 퍼즐 puzzle
🎰 슬롯 slot
🎉 축하 파티 party
🎊 색종이 confetti
🎈 풍선 balloon
🎀 리본 ribbon
🎁 선물 gift
🎃 호박 할로윈 pumpkin halloween
🎆 불꽃놀이 fireworks
🎇 폭죽 sparkler
🧨 폭죽 firecracker
🪁 연 kite
🪀 요요 yoyo
🧸 곰인형 teddy bear
🪄 마술봉 magic wand
` },
    { id: 'travel', label: '여행·장소', icon: '🚗', lines: `
🚗 자동차 car
🚕 택시 taxi
🚙 SUV suv
🚌 버스 bus
🚎 트롤리 trolley
🏎️ 레이싱 race car
🚓 경찰차 police car
🚑 구급차 ambulance
🚒 소방차 fire truck
🚚 트럭 truck
🚜 트랙터 tractor
🛵 스쿠터 scooter
🏍️ 오토바이 motorcycle
🚲 자전거 bicycle
🛴 킥보드 kick scooter
🚂 기차 증기 train
🚄 고속철 KTX bullet train
🚇 지하철 subway metro
🚊 트램 tram
✈️ 비행기 airplane
🛫 이륙 departure
🛬 착륙 arrival
🚀 로켓 rocket
🛸 우주선 UFO
🚁 헬리콥터 helicopter
⛵ 돛단배 sailboat
🚤 보트 speedboat
🛳️ 여객선 ship
⚓ 닻 anchor
⛽ 주유소 fuel
🚧 공사 construction
🚦 신호등 traffic light
🗺️ 지도 map
🧭 나침반 compass
🏠 집 house home
🏡 정원집 house garden
🏢 사무실 건물 office building
🏣 우체국 post office
🏥 병원 hospital
🏦 은행 bank
🏨 호텔 hotel
🏪 편의점 convenience store
🏫 학교 school
🏬 백화점 department store
🏭 공장 factory
🏯 성 castle
🏰 성 castle
🗼 타워 tower
🗽 자유의여신상 statue
⛪ 교회 church
🕌 모스크 mosque
🛕 사원 temple
⛲ 분수 fountain
⛺ 텐트 캠핑 tent camping
🌁 안개 foggy
🌃 밤도시 night city
🌆 해질녘 도시 city dusk
🌇 석양 sunset
🌉 다리 bridge
🎡 관람차 ferris wheel
🎢 롤러코스터 roller coaster
🎠 회전목마 carousel
🚪 문 door
🪑 의자 chair
🛏️ 침대 bed
🛋️ 소파 couch
🚽 화장실 toilet
🚿 샤워 shower
🛁 욕조 bathtub
🧳 여행가방 luggage
⌛ 모래시계 hourglass
⏳ 흐르는모래시계 hourglass flowing
⌚ 시계 watch
⏰ 알람 alarm clock
⏱️ 스톱워치 stopwatch
⏲️ 타이머 timer
🕐 한시 clock
` },
    { id: 'object', label: '사물', icon: '💡', lines: `
📱 휴대폰 phone mobile
☎️ 전화 telephone
📞 수화기 receiver
📟 삐삐 pager
📠 팩스 fax
🔋 배터리 battery
🔌 플러그 plug
💻 노트북 laptop
🖥️ 컴퓨터 desktop computer
🖨️ 프린터 printer
⌨️ 키보드 keyboard
🖱️ 마우스 mouse
💽 디스크 minidisc
💾 저장 플로피 save floppy
💿 CD cd
📀 DVD dvd
📷 카메라 camera
📸 플래시카메라 camera flash
📹 비디오 video camera
🎥 영화카메라 movie camera
📺 텔레비전 tv
📻 라디오 radio
🎙️ 녹음 studio mic
🔭 망원경 telescope
🔬 현미경 microscope
💡 전구 아이디어 bulb idea
🔦 손전등 flashlight
🕯️ 양초 candle
📔 노트 notebook
📕 책 닫힌 closed book
📖 책 펼친 open book
📗 초록책 green book
📘 파란책 blue book
📙 주황책 orange book
📚 책들 books
📓 공책 notebook
📒 원장 ledger
📃 문서 page curl
📜 두루마리 scroll
📄 문서 페이지 page
📰 신문 newspaper
🗞️ 말린신문 rolled newspaper
📑 북마크탭 bookmark tabs
🔖 책갈피 bookmark
🏷️ 라벨 태그 label tag
💰 돈 money bag
💴 엔 yen
💵 달러 dollar
💶 유로 euro
💳 카드 credit card
🧾 영수증 receipt
💹 증가 chart yen
✉️ 편지 envelope mail
📧 이메일 email
📨 받은편지 incoming
📩 보낸편지 envelope arrow
📤 보낸함 outbox
📥 받은함 inbox
📦 상자 택배 package box
📫 우편함 mailbox
📮 우체통 postbox
✏️ 연필 pencil
✒️ 만년필 pen nib
🖋️ 펜 fountain pen
🖊️ 볼펜 pen
🖌️ 붓 paintbrush
🖍️ 크레용 crayon
📝 메모 쓰기 memo note
💼 서류가방 briefcase
📁 폴더 folder
📂 열린폴더 open folder
🗂️ 분류폴더 index dividers
📅 달력 일정 calendar
📆 일정 tear-off calendar
🗓️ 달력 spiral calendar
📇 카드색인 card index
📈 상승 그래프 chart up
📉 하락 그래프 chart down
📊 막대그래프 bar chart
📋 클립보드 clipboard
📌 압정 pushpin
📍 위치 round pushpin
📎 클립 paperclip
🖇️ 연결클립 linked clips
📏 자 ruler
📐 삼각자 triangular ruler
✂️ 가위 scissors
🗃️ 카드상자 card file box
🗄️ 서류함 file cabinet
🗑️ 휴지통 wastebasket trash
🔒 잠금 lock
🔓 열림 unlock
🔏 잠금펜 lock pen
🔐 열쇠잠금 lock key
🔑 열쇠 key
🗝️ 옛열쇠 old key
🔨 망치 hammer
🪓 도끼 axe
⛏️ 곡괭이 pick
🛠️ 도구 tools
🗡️ 단검 dagger
⚔️ 검 swords
🔧 렌치 wrench
🔩 볼트 nut bolt
⚙️ 톱니 설정 gear settings
🧰 공구상자 toolbox
🧲 자석 magnet
⚗️ 증류기 alembic
🧪 시험관 실험 test tube
🧫 배양접시 petri dish
🧬 DNA dna
💊 알약 pill
💉 주사 syringe
🩺 청진기 stethoscope
🔍 돋보기 검색 magnifier search
🔎 돋보기 오른쪽 magnifier right
🧹 빗자루 broom
🧺 바구니 basket
🧻 휴지 toilet paper
🧼 비누 soap
🧽 스펀지 sponge
🛒 장바구니 cart shopping
🚬 담배 cigarette
🪦 묘비 headstone
🗿 모아이 moai
👑 왕관 crown
💎 보석 다이아 gem diamond
💍 반지 ring
👓 안경 glasses
🕶️ 선글라스 sunglasses
🧢 모자 cap
🎓 졸업모 graduation
👔 넥타이 necktie
👕 티셔츠 tshirt
👗 드레스 dress
👜 가방 handbag
🎒 책가방 backpack
👟 운동화 sneaker
🎩 모자 top hat
📢 확성기 loudspeaker
📣 메가폰 megaphone
🔔 종 알림 bell notification
🔕 알림끔 bell off
🎵 음표 music note
🎶 음악 notes
` },
    { id: 'symbol', label: '기호', icon: '✅', lines: `
✅ 체크 완료 check done
✔️ 체크표시 check mark
☑️ 체크박스 ballot check
❎ 엑스 cross mark
❌ 취소 엑스 x cancel
❓ 물음표 question
❔ 흰물음표 white question
❗ 느낌표 exclamation
❕ 흰느낌표 white exclamation
‼️ 이중느낌표 double exclamation
⁉️ 느낌물음 interrobang
⚠️ 경고 주의 warning
🚫 금지 prohibited
⛔ 출입금지 no entry
🔞 성인 18
♻️ 재활용 recycle
🔰 초보 beginner
⭕ 동그라미 circle
🔴 빨강 red circle
🟠 주황 orange circle
🟡 노랑 yellow circle
🟢 초록 green circle
🔵 파랑 blue circle
🟣 보라 purple circle
⚫ 검정 black circle
⚪ 하양 white circle
🟥 빨간네모 red square
🟧 주황네모 orange square
🟨 노란네모 yellow square
🟩 초록네모 green square
🟦 파란네모 blue square
🟪 보라네모 purple square
⬛ 검정네모 black square
⬜ 하얀네모 white square
🔶 주황마름모 orange diamond
🔷 파란마름모 blue diamond
🔸 작은주황 small orange diamond
🔹 작은파랑 small blue diamond
🔺 빨간삼각 red triangle
🔻 아래삼각 down triangle
💠 꽃모양마름모 diamond dot
🔘 라디오 radio button
🔳 흰사각단추 white square button
🔲 검은사각단추 black square button
▶️ 재생 play
⏸️ 일시정지 pause
⏹️ 정지 stop
⏺️ 녹화 record
⏭️ 다음 next
⏮️ 이전 prev
⏩ 빨리감기 fast forward
⏪ 되감기 rewind
🔼 위 up
🔽 아래 down
⬆️ 위쪽화살표 up arrow
⬇️ 아래쪽화살표 down arrow
⬅️ 왼쪽화살표 left arrow
➡️ 오른쪽화살표 right arrow
↗️ 오른위 up right
↘️ 오른아래 down right
↙️ 왼아래 down left
↖️ 왼위 up left
↕️ 위아래 up down
↔️ 좌우 left right
↩️ 되돌리기 return left
↪️ 앞으로 return right
🔄 새로고침 반복 refresh
🔁 반복 repeat
🔂 한곡반복 repeat one
🔀 섞기 shuffle
➕ 더하기 plus
➖ 빼기 minus
➗ 나누기 divide
✖️ 곱하기 multiply
♾️ 무한 infinity
💲 달러기호 dollar sign
🔱 삼지창 trident
📛 이름표 name badge
🔅 어둡게 dim
🔆 밝게 bright
〽️ 물결 part alternation
✳️ 별표 eight spoked asterisk
❇️ 반짝 sparkle
🔠 대문자 uppercase
🔡 소문자 lowercase
🔤 알파벳 abc
🔢 숫자 numbers 1234
#️⃣ 샵 해시 hash number sign
*️⃣ 별 asterisk
0️⃣ 영 zero
1️⃣ 일 one
2️⃣ 이 two
3️⃣ 삼 three
4️⃣ 사 four
5️⃣ 오 five
6️⃣ 육 six
7️⃣ 칠 seven
8️⃣ 팔 eight
9️⃣ 구 nine
🔟 십 ten
🆗 OK ok button
🆕 새로운 new
🆒 쿨 cool
🆓 무료 free
🆙 업 up
🆘 구조 sos
🅰️ A형 a
🅱️ B형 b
🅾️ O형 o
ℹ️ 정보 information
Ⓜ️ 메트로 m
♠️ 스페이드 spade
♥️ 하트카드 heart suit
♦️ 다이아카드 diamond suit
♣️ 클럽 club
🃏 조커 joker
🀄 마작 mahjong
🕛 열두시 twelve
©️ 저작권 copyright
®️ 등록 registered
™️ 상표 trademark
☮️ 평화 peace
☯️ 음양 yin yang
✝️ 십자가 cross
☪️ 초승달별 star crescent
🕉️ 옴 om
✡️ 다윗의별 star of david
⚛️ 원자 atom
♈ 양자리 aries
♉ 황소자리 taurus
♊ 쌍둥이자리 gemini
♋ 게자리 cancer
♌ 사자자리 leo
♍ 처녀자리 virgo
♎ 천칭자리 libra
♏ 전갈자리 scorpio
♐ 궁수자리 sagittarius
♑ 염소자리 capricorn
♒ 물병자리 aquarius
♓ 물고기자리 pisces
` },
    { id: 'flag', label: '깃발', icon: '🏁', lines: `
🏁 체크무늬깃발 결승 checkered flag
🚩 삼각깃발 triangular flag
🎌 교차깃발 crossed flags
🏴 검은깃발 black flag
🏳️ 흰깃발 white flag
🏳️‍🌈 무지개깃발 rainbow flag
🏴‍☠️ 해적깃발 pirate flag
🇰🇷 대한민국 한국 korea
🇰🇵 북한 north korea
🇯🇵 일본 japan
🇨🇳 중국 china
🇹🇼 대만 taiwan
🇺🇸 미국 usa united states
🇨🇦 캐나다 canada
🇲🇽 멕시코 mexico
🇧🇷 브라질 brazil
🇦🇷 아르헨티나 argentina
🇬🇧 영국 uk britain
🇫🇷 프랑스 france
🇩🇪 독일 germany
🇮🇹 이탈리아 italy
🇪🇸 스페인 spain
🇵🇹 포르투갈 portugal
🇳🇱 네덜란드 netherlands
🇨🇭 스위스 switzerland
🇸🇪 스웨덴 sweden
🇳🇴 노르웨이 norway
🇫🇮 핀란드 finland
🇷🇺 러시아 russia
🇺🇦 우크라이나 ukraine
🇹🇷 튀르키예 터키 turkey
🇮🇳 인도 india
🇹🇭 태국 thailand
🇻🇳 베트남 vietnam
🇵🇭 필리핀 philippines
🇮🇩 인도네시아 indonesia
🇸🇬 싱가포르 singapore
🇲🇾 말레이시아 malaysia
🇦🇺 호주 australia
🇳🇿 뉴질랜드 new zealand
🇸🇦 사우디 saudi
🇦🇪 아랍에미리트 uae
🇪🇬 이집트 egypt
🇿🇦 남아공 south africa
🇬🇷 그리스 greece
🇪🇺 유럽연합 eu
🇺🇳 유엔 un
` },
];

function parse(): EmojiCategory[] {
    return RAW.map((c) => ({
        id: c.id, label: c.label, icon: c.icon,
        items: c.lines.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
            const [char, ...kw] = l.split(/\s+/);
            return { char, keywords: kw, cat: c.id };
        }),
    }));
}

export const EMOJI_CATEGORIES: EmojiCategory[] = parse();
export const ALL_EMOJI: EmojiItem[] = EMOJI_CATEGORIES.flatMap((c) => c.items);

/** 검색 — 공백으로 나눈 낱말이 전부 (키워드·분류 이름)에 부분 일치하면 건진다. 대소문자 무시. */
export function searchEmoji(query: string): EmojiItem[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const labels = new Map(EMOJI_CATEGORIES.map((c) => [c.id, c.label]));
    return ALL_EMOJI.filter((e) => {
        const hay = `${e.keywords.join(' ')} ${labels.get(e.cat) ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
    });
}
