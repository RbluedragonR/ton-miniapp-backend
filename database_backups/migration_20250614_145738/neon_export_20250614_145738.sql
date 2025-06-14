--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users_sync; Type: TABLE DATA; Schema: neon_auth; Owner: neondb_owner
--

COPY neon_auth.users_sync (raw_json, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.announcements (announcement_id, title, content, type, image_url, action_url, action_text, is_pinned, is_active, published_at, expires_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (wallet_address, telegram_id, username, referral_code, referrer_wallet_address, created_at, updated_at, claimable_usdt_balance, claimable_arix_rewards) FROM stdin;
0:43083987ff40670469d1483c27f99f31bd307d6ebebfdeab5b32e7b98d180d2d	\N	\N	PF7EIWXV	\N	2025-06-04 11:55:12.260376+00	2025-06-04 11:55:12.260376+00	0.000000	0.000000000
0:d42060eeef8d8163c37d4d96a56dd3d6a9448ee71c0b87329f536c5a9c5ca321	691258888	babubig	CS6JJGPS	\N	2025-06-04 01:47:02.276714+00	2025-06-04 14:01:17.878099+00	0.000000	0.000000000
0:67c517996903dce7917688ffdf9c3ba1702d5c90987cb94ed01908de554180e3	\N	\N	BHDANQHH	\N	2025-06-05 00:50:57.575671+00	2025-06-05 00:50:57.575671+00	0.000000	0.000000000
0:bea285b414bf75c07f193dee2bcb69782c0d637a22098b447e2d8d68398e2839	102085319	Yazdan_1374	85WM74RG	\N	2025-06-05 21:18:14.665842+00	2025-06-05 21:32:10.879301+00	0.000000	0.000000000
0:7b66ff85bb9f5aa67450f9224193301acda1d4679d87ade1969a1270a9812460	1897468368	jane_rose_admin	F0831XL3	\N	2025-06-04 03:40:46.395507+00	2025-06-13 14:25:59.901806+00	0.000000	0.000000000
0:2a68ab785b2894ecbde25c302161daaa5b98a1c594fa8117e355a2220a488d56	7290455517	sunwukongdev	RQM4VOBQ	\N	2025-06-04 01:38:05.332298+00	2025-06-10 15:52:09.448019+00	0.000000	0.000000000
0:49525c4124e95aed883e463e44653a305c5f7698376b8bcaf46796aeb01c1bf5	7674252805	bigthingezra	45VVZUJ4	\N	2025-06-04 10:44:57.279505+00	2025-06-11 12:06:24.000506+00	0.000000	0.000000000
\.


--
-- Data for Name: coinflip_history; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.coinflip_history (game_id, user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix, played_at) FROM stdin;
\.


--
-- Data for Name: crash_rounds; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.crash_rounds (id, crash_multiplier, server_seed, public_hash, status, created_at, updated_at) FROM stdin;
1	1.21	\N	\N	running	2025-06-13 16:38:03.017992+00	2025-06-13 16:38:03.017992+00
2	1.13	\N	\N	crashed	2025-06-13 16:42:54.356463+00	2025-06-13 16:42:54.356463+00
3	1.82	\N	\N	running	2025-06-13 16:51:08.252454+00	2025-06-13 16:51:08.252454+00
4	5.64	\N	\N	running	2025-06-13 17:36:57.200568+00	2025-06-13 17:36:57.200568+00
5	2.32	\N	\N	crashed	2025-06-13 18:23:38.735437+00	2025-06-13 18:23:38.735437+00
6	1.18	\N	\N	crashed	2025-06-13 18:24:23.515218+00	2025-06-13 18:24:23.515218+00
7	1.54	\N	\N	crashed	2025-06-13 18:24:45.510766+00	2025-06-13 18:24:45.510766+00
8	3.42	\N	\N	crashed	2025-06-13 18:26:49.071351+00	2025-06-13 18:26:49.071351+00
9	1.55	\N	\N	crashed	2025-06-13 18:32:48.800299+00	2025-06-13 18:32:48.800299+00
10	1.12	\N	\N	crashed	2025-06-13 18:35:48.783438+00	2025-06-13 18:35:48.783438+00
\.


--
-- Data for Name: staking_plans; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.staking_plans (plan_id, plan_key, title, duration_days, fixed_usdt_apr_percent, arix_early_unstake_penalty_percent, min_stake_usdt, max_stake_usdt, referral_l1_invest_percent, referral_l2_invest_percent, referral_l2_commission_on_l1_bonus_percent, is_active, created_at) FROM stdin;
1	STARTER	Starter Plan	30	6.00	7.00	100.00	500.00	5.00	1.00	0.00	t	2025-06-03 22:14:19.786755+00
2	BUILDER	Builder Plan	60	7.50	7.00	500.00	1000.00	7.00	2.00	0.00	t	2025-06-03 22:14:19.786755+00
3	ADVANCED	Advanced Plan	90	9.00	7.00	1000.00	5000.00	10.00	0.00	3.00	t	2025-06-03 22:14:19.786755+00
4	VIP	VIP Plan	120	12.00	7.00	5000.00	\N	12.00	0.00	5.00	t	2025-06-03 22:14:19.786755+00
\.


--
-- Data for Name: user_stakes; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_stakes (stake_id, user_wallet_address, staking_plan_id, arix_amount_staked, reference_usdt_value_at_stake_time, stake_timestamp, unlock_timestamp, onchain_stake_tx_boc, onchain_stake_tx_hash, status, usdt_reward_accrued_total, last_usdt_reward_calc_timestamp, arix_penalty_applied, arix_final_reward_calculated, onchain_unstake_tx_boc, onchain_unstake_tx_hash, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: referral_rewards; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.referral_rewards (reward_id, stake_id, referrer_wallet_address, referred_wallet_address, level, reward_type, reward_amount_usdt, status, created_at) FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.tasks (task_id, task_key, title, description, reward_arix_amount, task_type, validation_type, action_url, is_active, is_repeatable, max_completions_user, start_date, end_date, created_at) FROM stdin;
1	TWITTER_FOLLOW_ARIX	Follow ARIX on Twitter	Follow our official ARIX Twitter account and verify.	100.000000000	social	manual	https://twitter.com/ARIX_PROJECT_X	t	f	1	\N	\N	2025-06-03 22:14:20.089542+00
2	TELEGRAM_JOIN_ARIX	Join ARIX Telegram Channel	Join our main Telegram channel for updates.	50.000000000	social	manual	https://t.me/ARIX_CHANEL	t	f	1	\N	\N	2025-06-03 22:14:20.089542+00
3	FIRST_STAKE_BONUS	First Stake Bonus	Make your first ARIX stake on any plan and get a bonus!	200.000000000	engagement	auto_approve_on_stake	\N	t	f	1	\N	\N	2025-06-03 22:14:20.089542+00
\.


--
-- Data for Name: user_arix_withdrawals; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_arix_withdrawals (withdrawal_id, user_wallet_address, amount_arix, status, onchain_tx_hash, requested_at, processed_at) FROM stdin;
\.


--
-- Data for Name: user_task_completions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_task_completions (completion_id, user_wallet_address, task_id, status, submission_data, completed_at, verified_at, reward_credited_at, notes) FROM stdin;
2	0:43083987ff40670469d1483c27f99f31bd307d6ebebfdeab5b32e7b98d180d2d	3	pending_verification	\N	2025-06-05 15:05:01.130086+00	\N	\N	\N
3	0:43083987ff40670469d1483c27f99f31bd307d6ebebfdeab5b32e7b98d180d2d	2	pending_verification	\N	2025-06-05 15:05:07.995873+00	\N	\N	\N
4	0:43083987ff40670469d1483c27f99f31bd307d6ebebfdeab5b32e7b98d180d2d	1	pending_verification	\N	2025-06-05 19:34:38.065079+00	\N	\N	\N
\.


--
-- Data for Name: user_usdt_withdrawals; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_usdt_withdrawals (withdrawal_id, user_wallet_address, amount_usdt, status, onchain_tx_hash, notes, requested_at, processed_at) FROM stdin;
\.


--
-- Name: announcements_announcement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.announcements_announcement_id_seq', 1, false);


--
-- Name: coinflip_history_game_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.coinflip_history_game_id_seq', 1, false);


--
-- Name: crash_rounds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.crash_rounds_id_seq', 10, true);


--
-- Name: referral_rewards_reward_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.referral_rewards_reward_id_seq', 1, false);


--
-- Name: staking_plans_plan_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.staking_plans_plan_id_seq', 4, true);


--
-- Name: tasks_task_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.tasks_task_id_seq', 3, true);


--
-- Name: user_task_completions_completion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.user_task_completions_completion_id_seq', 4, true);


--
-- Name: user_usdt_withdrawals_withdrawal_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.user_usdt_withdrawals_withdrawal_id_seq', 1, false);


--
-- Name: user_usdt_withdrawals_withdrawal_id_seq1; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.user_usdt_withdrawals_withdrawal_id_seq1', 1, false);


--
-- PostgreSQL database dump complete
--

