--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-06-14 13:39:50 EAT

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_referrer_wallet_address_fkey;
ALTER TABLE IF EXISTS ONLY public.user_usdt_withdrawals DROP CONSTRAINT IF EXISTS user_usdt_withdrawals_user_wallet_address_fkey;
ALTER TABLE IF EXISTS ONLY public.user_task_completions DROP CONSTRAINT IF EXISTS user_task_completions_user_wallet_address_fkey;
ALTER TABLE IF EXISTS ONLY public.user_task_completions DROP CONSTRAINT IF EXISTS user_task_completions_task_id_fkey;
ALTER TABLE IF EXISTS ONLY public.user_stakes DROP CONSTRAINT IF EXISTS user_stakes_user_wallet_address_fkey;
ALTER TABLE IF EXISTS ONLY public.user_stakes DROP CONSTRAINT IF EXISTS user_stakes_staking_plan_id_fkey;
ALTER TABLE IF EXISTS ONLY public.referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_stake_id_fkey;
ALTER TABLE IF EXISTS ONLY public.referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_referrer_wallet_address_fkey;
ALTER TABLE IF EXISTS ONLY public.referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_referred_wallet_address_fkey;
ALTER TABLE IF EXISTS ONLY public.coinflip_history DROP CONSTRAINT IF EXISTS coinflip_history_user_wallet_address_fkey;
DROP TRIGGER IF EXISTS users_before_insert_set_referral_code ON public.users;
DROP INDEX IF EXISTS public.idx_users_referrer;
DROP INDEX IF EXISTS public.idx_users_referral_code;
DROP INDEX IF EXISTS public.idx_user_usdt_withdrawals_user;
DROP INDEX IF EXISTS public.idx_user_usdt_withdrawals_status;
DROP INDEX IF EXISTS public.idx_user_task_completions_user_task;
DROP INDEX IF EXISTS public.idx_user_task_completions_status;
DROP INDEX IF EXISTS public.idx_user_stakes_wallet_address;
DROP INDEX IF EXISTS public.idx_user_stakes_status;
DROP INDEX IF EXISTS public.idx_referral_rewards_status;
DROP INDEX IF EXISTS public.idx_referral_rewards_referrer;
DROP INDEX IF EXISTS public.idx_coinflip_history_user;
DROP INDEX IF EXISTS public.idx_announcements_active_pinned_published;
DROP INDEX IF EXISTS neon_auth.users_sync_deleted_at_idx;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_telegram_id_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_referral_code_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.user_usdt_withdrawals DROP CONSTRAINT IF EXISTS user_usdt_withdrawals_pkey1;
ALTER TABLE IF EXISTS ONLY public.user_arix_withdrawals DROP CONSTRAINT IF EXISTS user_usdt_withdrawals_pkey;
ALTER TABLE IF EXISTS ONLY public.user_usdt_withdrawals DROP CONSTRAINT IF EXISTS user_usdt_withdrawals_onchain_tx_hash_key1;
ALTER TABLE IF EXISTS ONLY public.user_arix_withdrawals DROP CONSTRAINT IF EXISTS user_usdt_withdrawals_onchain_tx_hash_key;
ALTER TABLE IF EXISTS ONLY public.user_task_completions DROP CONSTRAINT IF EXISTS user_task_completions_pkey;
ALTER TABLE IF EXISTS ONLY public.user_stakes DROP CONSTRAINT IF EXISTS user_stakes_pkey;
ALTER TABLE IF EXISTS ONLY public.user_stakes DROP CONSTRAINT IF EXISTS user_stakes_onchain_unstake_tx_hash_key;
ALTER TABLE IF EXISTS ONLY public.user_stakes DROP CONSTRAINT IF EXISTS user_stakes_onchain_stake_tx_hash_key;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_task_key_key;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.staking_plans DROP CONSTRAINT IF EXISTS staking_plans_plan_key_key;
ALTER TABLE IF EXISTS ONLY public.staking_plans DROP CONSTRAINT IF EXISTS staking_plans_pkey;
ALTER TABLE IF EXISTS ONLY public.referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_pkey;
ALTER TABLE IF EXISTS ONLY public.crash_rounds DROP CONSTRAINT IF EXISTS crash_rounds_pkey;
ALTER TABLE IF EXISTS ONLY public.coinflip_history DROP CONSTRAINT IF EXISTS coinflip_history_pkey;
ALTER TABLE IF EXISTS ONLY public.announcements DROP CONSTRAINT IF EXISTS announcements_pkey;
ALTER TABLE IF EXISTS ONLY neon_auth.users_sync DROP CONSTRAINT IF EXISTS users_sync_pkey;
ALTER TABLE IF EXISTS public.user_usdt_withdrawals ALTER COLUMN withdrawal_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.user_task_completions ALTER COLUMN completion_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.user_arix_withdrawals ALTER COLUMN withdrawal_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tasks ALTER COLUMN task_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.staking_plans ALTER COLUMN plan_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.referral_rewards ALTER COLUMN reward_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.crash_rounds ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.coinflip_history ALTER COLUMN game_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.announcements ALTER COLUMN announcement_id DROP DEFAULT;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.user_usdt_withdrawals_withdrawal_id_seq1;
DROP SEQUENCE IF EXISTS public.user_usdt_withdrawals_withdrawal_id_seq;
DROP TABLE IF EXISTS public.user_usdt_withdrawals;
DROP SEQUENCE IF EXISTS public.user_task_completions_completion_id_seq;
DROP TABLE IF EXISTS public.user_task_completions;
DROP TABLE IF EXISTS public.user_stakes;
DROP TABLE IF EXISTS public.user_arix_withdrawals;
DROP SEQUENCE IF EXISTS public.tasks_task_id_seq;
DROP TABLE IF EXISTS public.tasks;
DROP SEQUENCE IF EXISTS public.staking_plans_plan_id_seq;
DROP TABLE IF EXISTS public.staking_plans;
DROP SEQUENCE IF EXISTS public.referral_rewards_reward_id_seq;
DROP TABLE IF EXISTS public.referral_rewards;
DROP SEQUENCE IF EXISTS public.crash_rounds_id_seq;
DROP TABLE IF EXISTS public.crash_rounds;
DROP SEQUENCE IF EXISTS public.coinflip_history_game_id_seq;
DROP TABLE IF EXISTS public.coinflip_history;
DROP SEQUENCE IF EXISTS public.announcements_announcement_id_seq;
DROP TABLE IF EXISTS public.announcements;
DROP TABLE IF EXISTS neon_auth.users_sync;
DROP FUNCTION IF EXISTS public.set_referral_code();
DROP FUNCTION IF EXISTS public.generate_referral_code();
DROP SCHEMA IF EXISTS neon_auth;
--
-- TOC entry 6 (class 2615 OID 16478)
-- Name: neon_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA neon_auth;


--
-- TOC entry 239 (class 1255 OID 122898)
-- Name: generate_referral_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_referral_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  chars TEXT[] := '{A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,0,1,2,3,4,5,6,7,8,9}';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP -- Generate an 8-character code
    result := result || chars[1+random()*(array_length(chars, 1)-1)];
  END LOOP;
  RETURN result;
END;
$$;


--
-- TOC entry 240 (class 1255 OID 122899)
-- Name: set_referral_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_referral_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    LOOP
      NEW.referral_code := generate_referral_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE referral_code = NEW.referral_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- TOC entry 218 (class 1259 OID 16479)
-- Name: users_sync; Type: TABLE; Schema: neon_auth; Owner: -
--

CREATE TABLE neon_auth.users_sync (
    raw_json jsonb NOT NULL,
    id text GENERATED ALWAYS AS ((raw_json ->> 'id'::text)) STORED NOT NULL,
    name text GENERATED ALWAYS AS ((raw_json ->> 'display_name'::text)) STORED,
    email text GENERATED ALWAYS AS ((raw_json ->> 'primary_email'::text)) STORED,
    created_at timestamp with time zone GENERATED ALWAYS AS (to_timestamp((trunc((((raw_json ->> 'signed_up_at_millis'::text))::bigint)::double precision) / (1000)::double precision))) STORED,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- TOC entry 236 (class 1259 OID 123039)
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    announcement_id integer NOT NULL,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    type character varying(50) DEFAULT 'info'::character varying,
    image_url text,
    action_url text,
    action_text character varying(100),
    is_pinned boolean DEFAULT false,
    is_active boolean DEFAULT true,
    published_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone
);


--
-- TOC entry 235 (class 1259 OID 123038)
-- Name: announcements_announcement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.announcements_announcement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3509 (class 0 OID 0)
-- Dependencies: 235
-- Name: announcements_announcement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.announcements_announcement_id_seq OWNED BY public.announcements.announcement_id;


--
-- TOC entry 230 (class 1259 OID 122987)
-- Name: coinflip_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coinflip_history (
    game_id integer NOT NULL,
    user_wallet_address character varying(68) NOT NULL,
    bet_amount_arix numeric(20,9) NOT NULL,
    choice character varying(10) NOT NULL,
    server_coin_side character varying(10) NOT NULL,
    outcome character varying(10) NOT NULL,
    amount_delta_arix numeric(20,9) NOT NULL,
    played_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 229 (class 1259 OID 122986)
-- Name: coinflip_history_game_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coinflip_history_game_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3510 (class 0 OID 0)
-- Dependencies: 229
-- Name: coinflip_history_game_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coinflip_history_game_id_seq OWNED BY public.coinflip_history.game_id;


--
-- TOC entry 238 (class 1259 OID 131073)
-- Name: crash_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crash_rounds (
    id integer NOT NULL,
    crash_multiplier numeric(10,2) NOT NULL,
    server_seed character varying(255),
    public_hash character varying(255),
    status character varying(20) DEFAULT 'waiting'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 237 (class 1259 OID 131072)
-- Name: crash_rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crash_rounds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3511 (class 0 OID 0)
-- Dependencies: 237
-- Name: crash_rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crash_rounds_id_seq OWNED BY public.crash_rounds.id;


--
-- TOC entry 226 (class 1259 OID 122945)
-- Name: referral_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_rewards (
    reward_id integer NOT NULL,
    stake_id uuid,
    referrer_wallet_address character varying(68) NOT NULL,
    referred_wallet_address character varying(68) NOT NULL,
    level integer NOT NULL,
    reward_type character varying(50) NOT NULL,
    reward_amount_usdt numeric(20,6) NOT NULL,
    status character varying(20) DEFAULT 'credited'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 225 (class 1259 OID 122944)
-- Name: referral_rewards_reward_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referral_rewards_reward_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3512 (class 0 OID 0)
-- Dependencies: 225
-- Name: referral_rewards_reward_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referral_rewards_reward_id_seq OWNED BY public.referral_rewards.reward_id;


--
-- TOC entry 223 (class 1259 OID 122902)
-- Name: staking_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staking_plans (
    plan_id integer NOT NULL,
    plan_key character varying(50) NOT NULL,
    title character varying(100) NOT NULL,
    duration_days integer NOT NULL,
    fixed_usdt_apr_percent numeric(5,2) NOT NULL,
    arix_early_unstake_penalty_percent numeric(5,2) NOT NULL,
    min_stake_usdt numeric(10,2) DEFAULT 0,
    max_stake_usdt numeric(10,2),
    referral_l1_invest_percent numeric(5,2) DEFAULT 0,
    referral_l2_invest_percent numeric(5,2) DEFAULT 0,
    referral_l2_commission_on_l1_bonus_percent numeric(5,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 222 (class 1259 OID 122901)
-- Name: staking_plans_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staking_plans_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3513 (class 0 OID 0)
-- Dependencies: 222
-- Name: staking_plans_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staking_plans_plan_id_seq OWNED BY public.staking_plans.plan_id;


--
-- TOC entry 232 (class 1259 OID 123000)
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    task_id integer NOT NULL,
    task_key character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    reward_arix_amount numeric(20,9) DEFAULT 0,
    task_type character varying(50) DEFAULT 'social'::character varying,
    validation_type character varying(50) DEFAULT 'manual'::character varying,
    action_url text,
    is_active boolean DEFAULT true,
    is_repeatable boolean DEFAULT false,
    max_completions_user integer DEFAULT 1,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 231 (class 1259 OID 122999)
-- Name: tasks_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasks_task_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3514 (class 0 OID 0)
-- Dependencies: 231
-- Name: tasks_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasks_task_id_seq OWNED BY public.tasks.task_id;


--
-- TOC entry 220 (class 1259 OID 98388)
-- Name: user_arix_withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_arix_withdrawals (
    withdrawal_id integer NOT NULL,
    user_wallet_address character varying(68) NOT NULL,
    amount_arix numeric(20,9) NOT NULL,
    status character varying(20) DEFAULT 'pending_payout'::character varying NOT NULL,
    onchain_tx_hash character varying(64),
    requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone
);


--
-- TOC entry 224 (class 1259 OID 122916)
-- Name: user_stakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_stakes (
    stake_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_wallet_address character varying(68) NOT NULL,
    staking_plan_id integer NOT NULL,
    arix_amount_staked numeric(20,9) NOT NULL,
    reference_usdt_value_at_stake_time numeric(20,6) NOT NULL,
    stake_timestamp timestamp with time zone NOT NULL,
    unlock_timestamp timestamp with time zone NOT NULL,
    onchain_stake_tx_boc text,
    onchain_stake_tx_hash character varying(64),
    status character varying(30) DEFAULT 'pending_confirmation'::character varying NOT NULL,
    usdt_reward_accrued_total numeric(20,6) DEFAULT 0.00,
    last_usdt_reward_calc_timestamp timestamp with time zone,
    arix_penalty_applied numeric(20,9) DEFAULT 0,
    arix_final_reward_calculated numeric(20,9) DEFAULT 0,
    onchain_unstake_tx_boc text,
    onchain_unstake_tx_hash character varying(64),
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 234 (class 1259 OID 123018)
-- Name: user_task_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_task_completions (
    completion_id integer NOT NULL,
    user_wallet_address character varying(68) NOT NULL,
    task_id integer NOT NULL,
    status character varying(30) DEFAULT 'pending_verification'::character varying NOT NULL,
    submission_data jsonb,
    completed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    verified_at timestamp with time zone,
    reward_credited_at timestamp with time zone,
    notes text
);


--
-- TOC entry 233 (class 1259 OID 123017)
-- Name: user_task_completions_completion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_task_completions_completion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3515 (class 0 OID 0)
-- Dependencies: 233
-- Name: user_task_completions_completion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_task_completions_completion_id_seq OWNED BY public.user_task_completions.completion_id;


--
-- TOC entry 228 (class 1259 OID 122969)
-- Name: user_usdt_withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_usdt_withdrawals (
    withdrawal_id integer NOT NULL,
    user_wallet_address character varying(68) NOT NULL,
    amount_usdt numeric(20,6) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    onchain_tx_hash character varying(64),
    notes text,
    requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone
);


--
-- TOC entry 219 (class 1259 OID 98387)
-- Name: user_usdt_withdrawals_withdrawal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_usdt_withdrawals_withdrawal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3516 (class 0 OID 0)
-- Dependencies: 219
-- Name: user_usdt_withdrawals_withdrawal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_usdt_withdrawals_withdrawal_id_seq OWNED BY public.user_arix_withdrawals.withdrawal_id;


--
-- TOC entry 227 (class 1259 OID 122968)
-- Name: user_usdt_withdrawals_withdrawal_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_usdt_withdrawals_withdrawal_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3517 (class 0 OID 0)
-- Dependencies: 227
-- Name: user_usdt_withdrawals_withdrawal_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_usdt_withdrawals_withdrawal_id_seq1 OWNED BY public.user_usdt_withdrawals.withdrawal_id;


--
-- TOC entry 221 (class 1259 OID 122880)
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    wallet_address character varying(68) NOT NULL,
    telegram_id bigint,
    username character varying(255),
    referral_code character varying(10),
    referrer_wallet_address character varying(68),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    claimable_usdt_balance numeric(20,6) DEFAULT 0.00 NOT NULL,
    claimable_arix_rewards numeric(20,9) DEFAULT 0.00 NOT NULL
);


--
-- TOC entry 3286 (class 2604 OID 123042)
-- Name: announcements announcement_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements ALTER COLUMN announcement_id SET DEFAULT nextval('public.announcements_announcement_id_seq'::regclass);


--
-- TOC entry 3273 (class 2604 OID 122990)
-- Name: coinflip_history game_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coinflip_history ALTER COLUMN game_id SET DEFAULT nextval('public.coinflip_history_game_id_seq'::regclass);


--
-- TOC entry 3291 (class 2604 OID 131076)
-- Name: crash_rounds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crash_rounds ALTER COLUMN id SET DEFAULT nextval('public.crash_rounds_id_seq'::regclass);


--
-- TOC entry 3267 (class 2604 OID 122948)
-- Name: referral_rewards reward_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards ALTER COLUMN reward_id SET DEFAULT nextval('public.referral_rewards_reward_id_seq'::regclass);


--
-- TOC entry 3253 (class 2604 OID 122905)
-- Name: staking_plans plan_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staking_plans ALTER COLUMN plan_id SET DEFAULT nextval('public.staking_plans_plan_id_seq'::regclass);


--
-- TOC entry 3275 (class 2604 OID 123003)
-- Name: tasks task_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks ALTER COLUMN task_id SET DEFAULT nextval('public.tasks_task_id_seq'::regclass);


--
-- TOC entry 3246 (class 2604 OID 98391)
-- Name: user_arix_withdrawals withdrawal_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_arix_withdrawals ALTER COLUMN withdrawal_id SET DEFAULT nextval('public.user_usdt_withdrawals_withdrawal_id_seq'::regclass);


--
-- TOC entry 3283 (class 2604 OID 123021)
-- Name: user_task_completions completion_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_task_completions ALTER COLUMN completion_id SET DEFAULT nextval('public.user_task_completions_completion_id_seq'::regclass);


--
-- TOC entry 3270 (class 2604 OID 122972)
-- Name: user_usdt_withdrawals withdrawal_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_usdt_withdrawals ALTER COLUMN withdrawal_id SET DEFAULT nextval('public.user_usdt_withdrawals_withdrawal_id_seq1'::regclass);


--
-- TOC entry 3297 (class 2606 OID 16489)
-- Name: users_sync users_sync_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: -
--

ALTER TABLE ONLY neon_auth.users_sync
    ADD CONSTRAINT users_sync_pkey PRIMARY KEY (id);


--
-- TOC entry 3344 (class 2606 OID 123050)
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (announcement_id);


--
-- TOC entry 3333 (class 2606 OID 122993)
-- Name: coinflip_history coinflip_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coinflip_history
    ADD CONSTRAINT coinflip_history_pkey PRIMARY KEY (game_id);


--
-- TOC entry 3347 (class 2606 OID 131083)
-- Name: crash_rounds crash_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crash_rounds
    ADD CONSTRAINT crash_rounds_pkey PRIMARY KEY (id);


--
-- TOC entry 3327 (class 2606 OID 122952)
-- Name: referral_rewards referral_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_pkey PRIMARY KEY (reward_id);


--
-- TOC entry 3313 (class 2606 OID 122913)
-- Name: staking_plans staking_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staking_plans
    ADD CONSTRAINT staking_plans_pkey PRIMARY KEY (plan_id);


--
-- TOC entry 3315 (class 2606 OID 122915)
-- Name: staking_plans staking_plans_plan_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staking_plans
    ADD CONSTRAINT staking_plans_plan_key_key UNIQUE (plan_key);


--
-- TOC entry 3336 (class 2606 OID 123014)
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (task_id);


--
-- TOC entry 3338 (class 2606 OID 123016)
-- Name: tasks tasks_task_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_task_key_key UNIQUE (task_key);


--
-- TOC entry 3319 (class 2606 OID 122931)
-- Name: user_stakes user_stakes_onchain_stake_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stakes
    ADD CONSTRAINT user_stakes_onchain_stake_tx_hash_key UNIQUE (onchain_stake_tx_hash);


--
-- TOC entry 3321 (class 2606 OID 122933)
-- Name: user_stakes user_stakes_onchain_unstake_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stakes
    ADD CONSTRAINT user_stakes_onchain_unstake_tx_hash_key UNIQUE (onchain_unstake_tx_hash);


--
-- TOC entry 3323 (class 2606 OID 122929)
-- Name: user_stakes user_stakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stakes
    ADD CONSTRAINT user_stakes_pkey PRIMARY KEY (stake_id);


--
-- TOC entry 3342 (class 2606 OID 123027)
-- Name: user_task_completions user_task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_task_completions
    ADD CONSTRAINT user_task_completions_pkey PRIMARY KEY (completion_id);


--
-- TOC entry 3301 (class 2606 OID 98397)
-- Name: user_arix_withdrawals user_usdt_withdrawals_onchain_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_arix_withdrawals
    ADD CONSTRAINT user_usdt_withdrawals_onchain_tx_hash_key UNIQUE (onchain_tx_hash);


--
-- TOC entry 3329 (class 2606 OID 122980)
-- Name: user_usdt_withdrawals user_usdt_withdrawals_onchain_tx_hash_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_usdt_withdrawals
    ADD CONSTRAINT user_usdt_withdrawals_onchain_tx_hash_key1 UNIQUE (onchain_tx_hash);


--
-- TOC entry 3303 (class 2606 OID 98395)
-- Name: user_arix_withdrawals user_usdt_withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_arix_withdrawals
    ADD CONSTRAINT user_usdt_withdrawals_pkey PRIMARY KEY (withdrawal_id);


--
-- TOC entry 3331 (class 2606 OID 122978)
-- Name: user_usdt_withdrawals user_usdt_withdrawals_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_usdt_withdrawals
    ADD CONSTRAINT user_usdt_withdrawals_pkey1 PRIMARY KEY (withdrawal_id);


--
-- TOC entry 3307 (class 2606 OID 122888)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (wallet_address);


--
-- TOC entry 3309 (class 2606 OID 122892)
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- TOC entry 3311 (class 2606 OID 122890)
-- Name: users users_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);


--
-- TOC entry 3295 (class 1259 OID 16490)
-- Name: users_sync_deleted_at_idx; Type: INDEX; Schema: neon_auth; Owner: -
--

CREATE INDEX users_sync_deleted_at_idx ON neon_auth.users_sync USING btree (deleted_at);


--
-- TOC entry 3345 (class 1259 OID 123060)
-- Name: idx_announcements_active_pinned_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_active_pinned_published ON public.announcements USING btree (is_active, is_pinned DESC, published_at DESC);


--
-- TOC entry 3334 (class 1259 OID 123057)
-- Name: idx_coinflip_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coinflip_history_user ON public.coinflip_history USING btree (user_wallet_address);


--
-- TOC entry 3324 (class 1259 OID 123055)
-- Name: idx_referral_rewards_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_referrer ON public.referral_rewards USING btree (referrer_wallet_address);


--
-- TOC entry 3325 (class 1259 OID 123056)
-- Name: idx_referral_rewards_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_status ON public.referral_rewards USING btree (status);


--
-- TOC entry 3316 (class 1259 OID 123054)
-- Name: idx_user_stakes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_stakes_status ON public.user_stakes USING btree (status);


--
-- TOC entry 3317 (class 1259 OID 123053)
-- Name: idx_user_stakes_wallet_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_stakes_wallet_address ON public.user_stakes USING btree (user_wallet_address);


--
-- TOC entry 3339 (class 1259 OID 123059)
-- Name: idx_user_task_completions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_task_completions_status ON public.user_task_completions USING btree (status);


--
-- TOC entry 3340 (class 1259 OID 123058)
-- Name: idx_user_task_completions_user_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_task_completions_user_task ON public.user_task_completions USING btree (user_wallet_address, task_id);


--
-- TOC entry 3298 (class 1259 OID 98475)
-- Name: idx_user_usdt_withdrawals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_usdt_withdrawals_status ON public.user_arix_withdrawals USING btree (status);


--
-- TOC entry 3299 (class 1259 OID 98474)
-- Name: idx_user_usdt_withdrawals_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_usdt_withdrawals_user ON public.user_arix_withdrawals USING btree (user_wallet_address);


--
-- TOC entry 3304 (class 1259 OID 123052)
-- Name: idx_users_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referral_code ON public.users USING btree (referral_code);


--
-- TOC entry 3305 (class 1259 OID 123051)
-- Name: idx_users_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referrer ON public.users USING btree (referrer_wallet_address);


--
-- TOC entry 3358 (class 2620 OID 122900)
-- Name: users users_before_insert_set_referral_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_before_insert_set_referral_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();


--
-- TOC entry 3355 (class 2606 OID 122994)
-- Name: coinflip_history coinflip_history_user_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coinflip_history
    ADD CONSTRAINT coinflip_history_user_wallet_address_fkey FOREIGN KEY (user_wallet_address) REFERENCES public.users(wallet_address);


--
-- TOC entry 3351 (class 2606 OID 122963)
-- Name: referral_rewards referral_rewards_referred_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_referred_wallet_address_fkey FOREIGN KEY (referred_wallet_address) REFERENCES public.users(wallet_address);


--
-- TOC entry 3352 (class 2606 OID 122958)
-- Name: referral_rewards referral_rewards_referrer_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_referrer_wallet_address_fkey FOREIGN KEY (referrer_wallet_address) REFERENCES public.users(wallet_address);


--
-- TOC entry 3353 (class 2606 OID 122953)
-- Name: referral_rewards referral_rewards_stake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_stake_id_fkey FOREIGN KEY (stake_id) REFERENCES public.user_stakes(stake_id) ON DELETE SET NULL;


--
-- TOC entry 3349 (class 2606 OID 122939)
-- Name: user_stakes user_stakes_staking_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stakes
    ADD CONSTRAINT user_stakes_staking_plan_id_fkey FOREIGN KEY (staking_plan_id) REFERENCES public.staking_plans(plan_id);


--
-- TOC entry 3350 (class 2606 OID 122934)
-- Name: user_stakes user_stakes_user_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stakes
    ADD CONSTRAINT user_stakes_user_wallet_address_fkey FOREIGN KEY (user_wallet_address) REFERENCES public.users(wallet_address);


--
-- TOC entry 3356 (class 2606 OID 123033)
-- Name: user_task_completions user_task_completions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_task_completions
    ADD CONSTRAINT user_task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(task_id);


--
-- TOC entry 3357 (class 2606 OID 123028)
-- Name: user_task_completions user_task_completions_user_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_task_completions
    ADD CONSTRAINT user_task_completions_user_wallet_address_fkey FOREIGN KEY (user_wallet_address) REFERENCES public.users(wallet_address);


--
-- TOC entry 3354 (class 2606 OID 122981)
-- Name: user_usdt_withdrawals user_usdt_withdrawals_user_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_usdt_withdrawals
    ADD CONSTRAINT user_usdt_withdrawals_user_wallet_address_fkey FOREIGN KEY (user_wallet_address) REFERENCES public.users(wallet_address);


--
-- TOC entry 3348 (class 2606 OID 122893)
-- Name: users users_referrer_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referrer_wallet_address_fkey FOREIGN KEY (referrer_wallet_address) REFERENCES public.users(wallet_address) ON DELETE SET NULL;


-- Completed on 2025-06-14 13:40:11 EAT

--
-- PostgreSQL database dump complete
--

