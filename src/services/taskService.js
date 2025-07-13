
const db = require('../config/database');
const OXYBLE_DECIMALS = 9; 

class TaskService {
    async fetchActiveTasks(userWalletAddress = null) {
        
        
        let tasksQuery = `
            SELECT 
                t.task_id, t.task_key, t.title, t.description, t.reward_OXYBLE_amount, 
                t.task_type, t.validation_type, t.action_url, t.is_repeatable, t.max_completions_user
            FROM tasks t
            WHERE t.is_active = TRUE 
              AND (t.start_date IS NULL OR t.start_date <= NOW())
              AND (t.end_date IS NULL OR t.end_date >= NOW())
            ORDER BY t.task_id ASC;
        `;
        const { rows: tasks } = await db.query(tasksQuery);

        if (!userWalletAddress) {
            return tasks.map(t => ({
                ...t,
                reward_OXYBLE_amount: parseFloat(t.reward_OXYBLE_amount).toFixed(OXYBLE_DECIMALS)
            }));
        }

        
        const userCompletionsQuery = `
            SELECT task_id, status, COUNT(*) as completions_count
            FROM user_task_completions
            WHERE user_wallet_address = $1
            GROUP BY task_id, status;
        `;
        const { rows: userCompletions } = await db.query(userCompletionsQuery, [userWalletAddress]);
        
        const completionsMap = new Map();
        userCompletions.forEach(comp => {
            if (!completionsMap.has(comp.task_id)) {
                completionsMap.set(comp.task_id, { count: 0, statuses: [] });
            }
            const entry = completionsMap.get(comp.task_id);
            entry.count += parseInt(comp.completions_count, 10);
            entry.statuses.push(comp.status);
        });

        return tasks.map(task => {
            const userCompletionInfo = completionsMap.get(task.task_id);
            let userStatus = 'not_started';
            let canAttempt = true;

            if (userCompletionInfo) {
                if (userCompletionInfo.statuses.includes('reward_credited') || userCompletionInfo.statuses.includes('approved')) {
                    userStatus = 'completed'; 
                } else if (userCompletionInfo.statuses.includes('pending_verification')) {
                    userStatus = 'pending_verification';
                } else if (userCompletionInfo.statuses.includes('rejected')) {
                    userStatus = 'rejected'; 
                }

                if (!task.is_repeatable && userCompletionInfo.count > 0) {
                    canAttempt = false;
                } else if (task.is_repeatable && userCompletionInfo.count >= task.max_completions_user) {
                    canAttempt = false;
                }
            }
            
            return {
                ...task,
                reward_OXYBLE_amount: parseFloat(task.reward_OXYBLE_amount).toFixed(OXYBLE_DECIMALS),
                user_status: userStatus,
                can_attempt: canAttempt
            };
        });
    }

    async recordTaskSubmission(userWalletAddress, taskId, submissionData) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            
            const taskRes = await client.query("SELECT * FROM tasks WHERE task_id = $1 AND is_active = TRUE", [taskId]);
            if (taskRes.rows.length === 0) {
                throw new Error("Task not found or is not active.");
            }
            const task = taskRes.rows[0];

            
            if (!task.is_repeatable) {
                const existingCompletion = await client.query(
                    "SELECT completion_id FROM user_task_completions WHERE user_wallet_address = $1 AND task_id = $2 AND status != 'rejected'", 
                    [userWalletAddress, taskId]
                );
                if (existingCompletion.rows.length > 0) {
                    throw new Error("You have already completed or submitted this task.");
                }
            } else {
                const completionsCountRes = await client.query(
                    "SELECT COUNT(*) as count FROM user_task_completions WHERE user_wallet_address = $1 AND task_id = $2 AND status != 'rejected'",
                    [userWalletAddress, taskId]
                );
                if (parseInt(completionsCountRes.rows[0].count, 10) >= task.max_completions_user) {
                    throw new Error(`You have reached the maximum completion limit (${task.max_completions_user}) for this task.`);
                }
            }
            
            
            let initialStatus = 'pending_verification';
            if (task.validation_type === 'auto_approve') {
                initialStatus = 'approved'; 
            } else if (task.validation_type === 'link_submission' && !submissionData?.link) {
                 throw new Error("A link submission is required for this task.");
            }
            

            const completionRes = await client.query(
                `INSERT INTO user_task_completions (user_wallet_address, task_id, status, submission_data, completed_at)
                 VALUES ($1, $2, $3, $4, NOW()) RETURNING completion_id, status`,
                [userWalletAddress, taskId, initialStatus, submissionData ? JSON.stringify(submissionData) : null]
            );
            const newCompletion = completionRes.rows[0];
            let message = `Task '${task.title}' submitted. Status: ${newCompletion.status}.`;
            let rewardCredited = false;

            
            if (newCompletion.status === 'approved' && parseFloat(task.reward_OXYBLE_amount) > 0) {
                const rewardAmount = parseFloat(task.reward_OXYBLE_amount);
                
                await client.query("INSERT INTO users (wallet_address) VALUES ($1) ON CONFLICT (wallet_address) DO NOTHING", [userWalletAddress]);
                
                
                await client.query(
                    `UPDATE users SET claimable_OXYBLE_rewards = COALESCE(claimable_OXYBLE_rewards, 0) + $1, updated_at = NOW() 
                     WHERE wallet_address = $2`,
                    [rewardAmount, userWalletAddress]
                );
                
                await client.query(
                    `UPDATE user_task_completions SET status = 'reward_credited', reward_credited_at = NOW(), verified_at = NOW() 
                     WHERE completion_id = $1`,
                    [newCompletion.completion_id]
                );
                message = `Task '${task.title}' approved! ${rewardAmount.toFixed(OXYBLE_DECIMALS)} OXYBLE credited to your rewards balance.`;
                rewardCredited = true;
            }
            
            
            
            
            
            if (task.task_key === 'FIRST_STAKE_TASK' && task.validation_type === 'auto_approve_on_stake') {
                 
                 if (parseFloat(task.reward_OXYBLE_amount) > 0 && !rewardCredited) {
                    const rewardAmount = parseFloat(task.reward_OXYBLE_amount);
                    await client.query(`UPDATE users SET claimable_OXYBLE_rewards = COALESCE(claimable_OXYBLE_rewards, 0) + $1, updated_at = NOW() WHERE wallet_address = $2`, [rewardAmount, userWalletAddress]);
                    await client.query(`UPDATE user_task_completions SET status = 'reward_credited', reward_credited_at = NOW(), verified_at = NOW() WHERE completion_id = $1`, [newCompletion.completion_id]);
                    message = `Task '${task.title}' recorded! ${rewardAmount.toFixed(OXYBLE_DECIMALS)} OXYBLE credited.`;
                    rewardCredited = true;
                 } else if (!rewardCredited) {
                    await client.query(`UPDATE user_task_completions SET status = 'approved', verified_at = NOW() WHERE completion_id = $1`, [newCompletion.completion_id]);
                    message = `Task '${task.title}' recorded as completed.`;
                 }
            }


            await client.query('COMMIT');
            return { 
                completion_id: newCompletion.completion_id, 
                status: rewardCredited ? 'reward_credited' : newCompletion.status, 
                message: message,
                task_title: task.title
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("SERVICE: Error in recordTaskSubmission:", error.message, error.stack);
            throw error;
        } finally {
            client.release();
        }
    }

    async fetchUserTaskCompletions(userWalletAddress) {
        const query = `
            SELECT 
                utc.completion_id, utc.status, utc.submission_data, utc.completed_at, utc.verified_at, utc.reward_credited_at, utc.notes,
                t.task_id, t.task_key, t.title, t.description, t.reward_OXYBLE_amount, t.task_type, t.action_url
            FROM user_task_completions utc
            JOIN tasks t ON utc.task_id = t.task_id
            WHERE utc.user_wallet_address = $1
            ORDER BY utc.completed_at DESC;
        `;
        const { rows } = await db.query(query, [userWalletAddress]);
        return rows.map(row => ({
            ...row,
            reward_OXYBLE_amount: parseFloat(row.reward_OXYBLE_amount).toFixed(OXYBLE_DECIMALS)
        }));
    }
}

module.exports = new TaskService();