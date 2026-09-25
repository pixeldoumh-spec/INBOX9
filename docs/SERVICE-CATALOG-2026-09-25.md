# INBOX9 Service Catalog — 2026-09-25

Canonical source: the uploaded master service list dated 2026-09-25.

The catalog contains **216 services** in the supplied order. Names are preserved exactly; similar-looking entries are not silently merged.

## Runtime contract

- Runtime source: `data/services.json`
- Stable service ID: `svc-<slug>`
- Country: `IN`
- Currency: `INR`
- Current provisional category: `Other`
- Current provisional price: INR 10.00
- Provider routing is separate from catalog identity.
- Existing legacy PostgreSQL service rows are preserved as inactive history when the active catalog changes.

## Logo contract

The customer UI uses a single 576×864 WebP sprite at:

`frontend/public/service-icons-sprite.webp`

The sprite is a 12×18 grid of 48px tiles. Stable lookup is defined in:

`frontend/src/app/serviceLogoManifest.ts`

Each mapped service ID points to its sprite tile index. This keeps logo lookup independent of display-name casing and catalog reordering. Services without a supplied logo intentionally use the UI fallback instead of a broken image.

## Services

1. Yono Bonus 51
2. Joy Rummy
3. IND Rummy
4. INR Rummy
5. Rumble Rummy
6. Bingo 101
7. Spin 101
8. Diwa Top
9. Jaiho Slots
10. Rummy 91
11. Max Rummy
12. Gold Rummy
13. Win Rummy
14. Diwa X
15. Jaiho Rummy
16. Jaiho 91
17. Diwa Win
18. Maha Games
19. Jaiho 777 VIP
20. Rummy 888
21. Dhan Game
22. Diwa Game
23. Diwa VIP
24. IND Club
25. All Yono Games
26. Diwa Slots
27. DIWA 777
28. Spin Crush
29. Spin Winner
30. Spin Gold
31. Slots Winner
32. Rummy Ludo
33. Jaiho Spin
34. Yono 777
35. Rummy 77
36. 777 Game
37. Club INR
38. Winzo Rummy
39. Rummy App
40. Ever 777
41. INR Slots
42. Good Slots
43. Boss Rummy
44. Hindi 777
45. YN 777
46. Yes Spin
47. OK Rummy
48. Love Rummy
49. Share Slots
50. Hi Rummy
51. Rani Slots
52. Jaiho Win
53. Goa Spin
54. Slots Spin
55. MQM Bet
56. Saga Slots
57. Rummy Yono
58. ABC Rummy
59. Jaiho Arcade
60. Neta VIP
61. MWM Bet
62. EN 365
63. 101Z App
64. Rummy 365
65. IND Bingo
66. My 777
67. Bet 213 Slots
68. GoGo Rummy
69. 789 Jackpot
70. MDM Bet
71. Spin Lucky
72. IND Slots
73. MKM Bet
74. Yono Maha Games
75. Game Rummy
76. MBM Bet
77. Jaiho 777
78. TOP Rummy
79. Spin 777
80. 567 Slots
81. Yono VIP
82. Yono Slots
83. Yono Arcade
84. Yono Rummy
85. Yono All Games
86. Yono Game
87. Yono Games
88. Yono App
89. New Yono App
90. All Rummy Apps
91. Money Rummy
92. YN Rummy
93. Yoyo Slots
94. SVIP 777
95. Rummy Zip
96. Diwa Lucky
97. Diwa Ace
98. Diwa King
99. Diwa Play
100. Diwa Bet
101. Diwa Spin
102. Diwa Rummy
103. Diwa Club
104. Diwa 91
105. Diwa Gold
106. Jeet Spin
107. All Diwa Apps
108. PP 777
109. Holy Rummy
110. Teen Patti Master
111. Ind Vip
112. Rumble Rummy 77
113. Yono Rumble Rummy
114. Bolly Game
115. T989
116. Rummy Mate
117. Rummy GOLD
118. Tycoon
119. K9
120. MMY
121. BDG Game
122. NEW 66 lotry
123. Ww9
124. Goplay11
125. Win 03
126. Woho Game
127. Yono Slot
128. Come11
129. KaliWins
130. RUMMY HOLLY
131. rummy nabob
132. RUMMY OLA
133. Diva ace
134. Diva Lucky
135. Diva King
136. Diva X
137. Diva Top
138. DivaVIP
139. Diva Game
140. Diva Slots
141. Diva 777
142. JAI HO SLOTS
143. Slot Spin
144. Diva 2026
145. Teen Patti Gold
146. Rummy Wealth
147. Rummy Modern
148. Rummy All App
149. AK777
150. Rummy Ares
151. 11 Winner APK
152. All Rummy App
153. Rummy New App
154. Colour Trading
155. Prosafe Bet
156. MSM Bet
157. 365 Jeet
158. RK Ludo
159. Gogo Anime
160. Spin Yono
161. Game 3f
162. Download Svip
163. KAL WIN
164. Rummy Sultan
165. New Rummy App
166. 1a Game
167. 8 Game App
168. Slots 777
169. Slot Guru
170. Rummy Black
171. TeenPatti Happy
172. Rummy Master
173. Yono Rummy 2026
174. All Yono Apk
175. CASINO GAME
176. Yono Games List
177. 777 Rummy
178. Rummy Vip APK
179. Download Rummy Ludo
180. Crush Spin
181. ABC VIP
182. Rummy 333
183. Best Yono App
184. Best Yono
185. POP Slots
186. Download Yono Rummy
187. DOWNLOAD LCG BET
188. 3 Patti Master
189. Teen Patti Bliss
190. Navo Slots
191. Jaiclub GAME
192. SXRIPL GAME
193. Rummy Loot
194. ALL VV5 GAME
195. Crown Rummy
196. Teenpatti Bazaar
197. 5177 Win
198. Yono Arcarde
199. Rummy Good
200. Bet 11
201. AYUIPL GAME
202. Download Rummy 365
203. Rummy 777
204. KOKO SLOTS
205. Raja Game Download
206. Yono Yoyo Slots
207. Gg9 Android App
208. Frenzy Winner
209. En 365 Games
210. 9Game Apk
211. Diwa Slot
212. Namaste Teenpatti Apk
213. All Yono Slots
214. 3 Patti Hot
215. 21 Game Download
216. Rummy Grand
