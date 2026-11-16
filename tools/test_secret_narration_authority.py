"""Closed narration codec authority, legacy durability and receipt binding."""
from dataclasses import replace
import struct

import pytest
from tools.secret_continuation import (encode,decode,bind_result,make_receipt,activate,
                                      projected_roster,packed_count,SECTION_KEYS,BODY_OFFSET)
from tools.test_secret_continuation import prepared,inputs,result,menu_effect
from tools.test_secret_continuation_v16 import who
from tools.test_secret_continuation_validate import image as validator_image,admitted
from tools.test_secret_print import packed_values


def stream_for(output,codec,values):
    raw=packed_values(values)
    long=struct.pack('<10H',0x11,1,*([0]*8))+struct.pack('<H4sH',65535,b'GBPX',0)+bytes(26)
    terminal=output[2252:2272]+output[3532:3566]
    return (struct.pack('<4s2H',b'GBSL',2,2)+long+terminal
            +struct.pack('<4s4H',b'GBPX',codec,1,len(raw),0)
            +struct.pack('<4H',0,0,len(raw),packed_count(raw,codec))+raw)


def owned(prepared,codec,values,typed=True):
    bound=bind_result(replace(prepared,interactive=True),result(prepared),b'party\r\n')
    output=bytearray(who(prepared,1) if typed else menu_effect(0x15))
    struct.pack_into('<H',output,6,struct.unpack_from('<H',output,6)[0]|0x100)
    stream=stream_for(bytes(output),codec,values)
    return activate(bound,bytes(output),stream=stream,
                    producer_receipt=make_receipt(bound,bytes(output),wrapper_exit=0,stream=stream),
                    settled_result=result(prepared)[:14]+b'\1\0'+result(prepared)[16:],
                    settled_roster=projected_roster(bound,result(prepared)))


@pytest.mark.parametrize('codec',[1,2])
@pytest.mark.parametrize('values',[[1]*40+[0]+[2]*80,[1]*340,[0]*20+[1]*44] )
def test_typed_old_and_new_codecs_native_and_model(prepared,validator_image,codec,values):
    if codec==1 and values[0]==0:
        with pytest.raises(ValueError):owned(prepared,codec,values)
        return
    record=owned(prepared,codec,values)
    assert decode(encode(record))==record
    assert admitted(validator_image,encode(record))
    assert record.part('stream')[-len(packed_values(values)):]==packed_values(values)


@pytest.mark.parametrize('codec',[1,2,3,0])
@pytest.mark.parametrize('typed',[False,True])
def test_codec_revision_cannot_grant_generic_or_future_authority(prepared,validator_image,codec,typed):
    record=owned(prepared,1,[1]*44,typed)
    raw=bytearray(encode(record))
    stream=record.part('stream');extension=8+2*54+4
    stream_start=BODY_OFFSET+sum(len(s) for s in record.sections[:SECTION_KEYS.index('stream')])
    receipt_start=BODY_OFFSET+sum(len(s) for s in record.sections[:SECTION_KEYS.index('receipt')])
    receipt=record.part('receipt')
    embedded=receipt.rindex(stream)
    # Coherent negative mirrors only the codec word in its receipt output.
    for at in (stream_start+extension,receipt_start+embedded+extension):
        struct.pack_into('<H',raw,at,codec)
    accepted=codec==1 or codec==2 and typed
    if accepted:assert decode(bytes(raw)).part('stream')[extension:extension+2]==struct.pack('<H',codec)
    else:
        with pytest.raises(ValueError):decode(bytes(raw))
    assert admitted(validator_image,bytes(raw))==accepted


def test_successive_generations_keep_legacy_codec_bytes_before_upgrade(prepared,validator_image):
    old=owned(prepared,1,[1]*40+[0]+[2]*80)
    frozen=encode(old)
    assert decode(frozen)==old and admitted(validator_image,frozen)
    new=owned(prepared,2,[1]*40+[0]+[2]*80)
    assert admitted(validator_image,encode(new)) and decode(frozen)==old
    assert old.part('stream')[-91:]==new.part('stream')[-91:]
    assert packed_count(old.part('stream')[-91:],1)==40
    assert packed_count(new.part('stream')[-91:],2)==120
