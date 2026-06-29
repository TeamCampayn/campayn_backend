-- Add UNIQUE constraint on brands(user_id) to prevent duplicate brand profiles per user
ALTER TABLE public.brands
ADD CONSTRAINT unique_brands_user_id UNIQUE (user_id);
