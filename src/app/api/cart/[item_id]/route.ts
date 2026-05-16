import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOpenCart, OPEN_CART_STATUSES } from '../_lib';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ item_id: string }> },
) {
  try {
    const { item_id: itemId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const cart = await getOpenCart(db, user.id);
    if (!cart) {
      return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    }

    if (cart.status === 'checkout_in_progress') {
      return NextResponse.json(
        { error: 'Cart checkout is already in progress. Complete, cancel, or wait for the checkout to expire.' },
        { status: 409 },
      );
    }

    const { data: target, error: selectError } = await db
      .from('cart_items')
      .select('id')
      .eq('id', itemId)
      .eq('cart_id', cart.id)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (!target) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { error: deleteError } = await db
      .from('cart_items')
      .delete()
      .eq('id', itemId)
      .eq('cart_id', cart.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { count, error: countError } = await db
      .from('cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('cart_id', cart.id);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((count ?? 0) === 0 && OPEN_CART_STATUSES.includes(cart.status)) {
      await db.from('carts').update({ status: 'active' }).eq('id', cart.id);
    }

    return NextResponse.json({
      success: true,
      removedItemId: itemId,
      remainingCount: count ?? 0,
    });
  } catch (error) {
    console.error('Cart DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
