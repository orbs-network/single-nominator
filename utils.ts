import { Tuple, TupleItem, TupleReader } from "@ton/core";

export const buff2bigint = (buff: Buffer) : bigint => {
    return BigInt("0x" + buff.toString("hex"));
}

export const bigint2buff = (num:bigint) : Buffer => {
    let buffStr = num.toString(16);
    if(buffStr.length % 2 != 0) {
        buffStr = "0" + buffStr;
    }
    return Buffer.from(buffStr, 'hex')
}

const getRandom = (min:number, max:number) => {
    return Math.random() * (max - min) + min;
}

export const getRandomInt = (min: number, max: number) => {
    return Math.round(getRandom(min, max));
}

interface IAny {}
interface TupleReaderConstructor <T extends IAny>{
    new (...args: any[]) : T
    fromReader(rdr: TupleReader) : T;
}

class TupleReaderFactory<T extends IAny>{
    private constructable: TupleReaderConstructor<T>;
    constructor(constructable: TupleReaderConstructor<T>) {
        this.constructable = constructable;
    }
    createObject(rdr: TupleReader) : T {
        return this.constructable.fromReader(rdr);
    }
}

class LispIterator <T extends IAny> implements Iterator <T> {

    private curItem:TupleReader | null;
    private done:boolean;
    private ctor: TupleReaderFactory<T>;

    constructor(tuple:TupleReader | null, ctor: TupleReaderFactory<T>) {
        this.done    = false; //tuple === null || tuple.remaining == 0;
        this.curItem = tuple;
        this.ctor    = ctor;
    }

    public next(): IteratorResult<T> {

        this.done = this.curItem === null || this.curItem.remaining  == 0;
        let value: TupleReader;
        if( ! this.done) {
            const head = this.curItem!.readTuple();
            const tail = this.curItem!.readTupleOpt();

            if(tail !== null) {
                this.curItem = tail;
            }

            value = head;
            return {done: this.done, value:  this.ctor.createObject(value)};
        }
        else {
            return {done: true, value: null}
        }
    }
}

export class LispList <T extends IAny> {
    private tuple: TupleReader | null;
    private ctor: TupleReaderFactory<T>;

    constructor(tuple: TupleReader | null, ctor: TupleReaderConstructor<T>) {
        this.tuple = tuple;
        this.ctor  = new TupleReaderFactory(ctor);
    }

    toArray() : T[] {
        return [...this];
    }

    [Symbol.iterator]() {
        return new LispIterator(this.tuple, this.ctor);
    }
}
