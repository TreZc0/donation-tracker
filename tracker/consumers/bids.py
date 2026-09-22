from asgiref.sync import async_to_sync, sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.layers import get_channel_layer
from django.db import transaction

BID_PROCESSING_GROUP_NAME = 'bid_processing'


class BidProcessingConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        if not await sync_to_async(self.scope['user'].has_perm)('tracker.view_bid'):
            await self.close()
            return
        await self.channel_layer.group_add(BID_PROCESSING_GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(BID_PROCESSING_GROUP_NAME, self.channel_name)

    async def bids_changed(self, event):
        await self.send_json({'type': 'bids_changed', 'event': event['event']})


def broadcast_bid_change(event_id, *, using):
    # Refetch only after the transaction's tree and moderation changes are visible.
    def broadcast():
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)(
                BID_PROCESSING_GROUP_NAME,
                {'type': 'bids_changed', 'event': event_id},
            )

    transaction.on_commit(broadcast, using=using)
